import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { claim, workerPool } from '../services/worker/src/queue';
// Dedicated disposable PostgreSQL only: this suite creates the auth schema and roles.
const connection = process.env.TEST_DATABASE_URL;
if (connection && !new URL(connection).pathname.endsWith('_test'))
  throw new Error(
    'Database tests require a disposable database whose name ends with _test.',
  );
describe.skipIf(!connection)(
  'PostgreSQL ownership, quotas and queue fencing',
  () => {
    const pool = new Pool({ connectionString: connection });
    const a = '11111111-1111-4111-8111-111111111111',
      b = '22222222-2222-4222-8222-222222222222';
    let jobId: string;
    beforeAll(async () => {
      await pool.query(
        "create schema if not exists auth; create table if not exists auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;",
      );
      await pool.query(
        await readFile(
          new URL(
            '../supabase/migrations/202610300001_initial.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await pool.query('insert into auth.users(id) values($1),($2)', [a, b]);
      const r = await pool.query(
        "insert into video_jobs(user_id,filename,source_object_key,pending_object_key,input_size_bytes,status) values($1,'video.mp4','source','pending',10,'queued') returning id",
        [a],
      );
      jobId = r.rows[0].id;
    });
    afterAll(async () => {
      await pool.end();
      await workerPool.end();
    });
    it('RLS hides other users and prevents forged ownership', async () => {
      const db = await pool.connect();
      try {
        await db.query('begin');
        await db.query('set local role forged_web');
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          b,
        ]);
        expect(
          (await db.query('select id from video_jobs where id=$1', [jobId]))
            .rowCount,
        ).toBe(0);
        await expect(
          db.query(
            "insert into video_jobs(user_id,filename,source_object_key,pending_object_key,input_size_bytes) values($1,'x','s','p',1)",
            [a],
          ),
        ).rejects.toThrow();
      } finally {
        await db.query('rollback');
        db.release();
      }
    });
    it('atomic quota increments allow exactly the configured daily limit under contention', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          pool.query(
            'insert into usage_counters(user_id,usage_date,submitted_jobs) values($1,current_date,1) on conflict(user_id,usage_date) do update set submitted_jobs=usage_counters.submitted_jobs+1 where usage_counters.submitted_jobs<3 returning submitted_jobs',
            [a],
          ),
        ),
      );
      expect(results.filter((r) => r.rowCount === 1)).toHaveLength(3);
    });
    it('session locks fence other workers until explicitly released', async () => {
      const first = await pool.connect(),
        second = await pool.connect();
      try {
        await first.query('select pg_advisory_lock(hashtextextended($1,17))', [
          jobId,
        ]);
        expect(
          (
            await second.query(
              'select pg_try_advisory_lock(hashtextextended($1,17)) as ok',
              [jobId],
            )
          ).rows[0].ok,
        ).toBe(false);
        await first.query('select pg_advisory_unlock_all()');
        expect(
          (
            await second.query(
              'select pg_try_advisory_lock(hashtextextended($1,17)) as ok',
              [jobId],
            )
          ).rows[0].ok,
        ).toBe(true);
      } finally {
        await second.query('select pg_advisory_unlock_all()');
        first.release();
        second.release();
      }
    });
    it('claims atomically, restarts a stale pre-completion job, and fences ambiguous completion', async () => {
      const first = await pool.connect(),
        second = await pool.connect();
      try {
        await first.query('set role forged_worker');
        await second.query('set role forged_worker');
        const initial = await claim(first);
        expect(initial?.id).toBe(jobId);
        expect(initial?.attempts).toBe(1);
        await first.query(
          "update video_jobs set lease_expires_at=now()-interval '1 minute' where id=$1",
          [jobId],
        );
        expect(await claim(second)).toBeUndefined();
        await first.query('select pg_advisory_unlock_all()');
        const recovered = await claim(second);
        expect(recovered?.id).toBe(jobId);
        expect(recovered?.attempts).toBe(2);
        await second.query(
          "update video_jobs set completion_started=true,lease_expires_at=now()-interval '1 minute' where id=$1",
          [jobId],
        );
        await second.query('select pg_advisory_unlock_all()');
        expect(await claim(first)).toBeUndefined();
        const terminal = await first.query(
          'select status,error_code from video_jobs where id=$1',
          [jobId],
        );
        expect(terminal.rows[0]).toEqual({
          status: 'failed',
          error_code: 'COMPLETION_UNKNOWN',
        });
        await first.query(
          "delete from api_rate_limits where window_start<now()-interval '1 day'",
        );
      } finally {
        await first.query('select pg_advisory_unlock_all()');
        await second.query('select pg_advisory_unlock_all()');
        await first.query('reset role');
        await second.query('reset role');
        first.release();
        second.release();
      }
    });
  },
);
