import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { recoveryDecision, AppError } from '@tikquick/shared';
export const workerId = randomUUID();
export const workerPool = new Pool({
  connectionString: process.env.WORKER_DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
});
export type ClaimedJob = {
  id: string;
  user_id: string;
  filename: string;
  source_object_key: string;
  pending_object_key: string;
  input_size_bytes: string;
  use_encoder: boolean;
  attempts: number;
  completion_started: boolean;
  created_at: string;
};
export async function claim(db: PoolClient) {
  await db.query('begin');
  try {
    const candidates = await db.query(
      "select * from video_jobs where (status='queued' or (status='processing' and lease_expires_at<now())) and not cancel_requested and expires_at>now() order by created_at for update skip locked limit 10",
    );
    let selected: ClaimedJob | undefined;
    for (const job of candidates.rows) {
      // Session locks survive transactions and fence a live worker even after its lease expires.
      const lock = await db.query(
        'select pg_try_advisory_lock(hashtextextended($1,17)) as acquired',
        [job.id],
      );
      if (!lock.rows[0].acquired) continue;
      const recovery = recoveryDecision(job.completion_started, job.attempts);
      if (recovery !== 'restart') {
        await db.query(
          "update video_jobs set status='failed',error_code=$2,error_message=$3,worker_id=null,lease_expires_at=null where id=$1",
          [
            job.id,
            recovery === 'ambiguous'
              ? 'COMPLETION_UNKNOWN'
              : 'ATTEMPTS_EXHAUSTED',
            recovery === 'ambiguous'
              ? 'Processing was interrupted after completion began. Its outcome is unknown; submit a new job to try again.'
              : 'The worker could not finish after three attempts.',
          ],
        );
        await db.query('select pg_advisory_unlock(hashtextextended($1,17))', [
          job.id,
        ]);
        continue;
      }
      const result = await db.query(
        "update video_jobs set status='processing',provider_stage='preparing',progress='{}',provider_job_id=null,worker_id=$2,lease_expires_at=now()+interval '60 seconds',started_at=coalesce(started_at,now()),attempts=attempts+1 where id=$1 returning *",
        [job.id, workerId],
      );
      selected = result.rows[0];
      break;
    }
    await db.query('commit');
    return selected;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
export async function updateJob(
  db: PoolClient,
  id: string,
  fields: Record<string, unknown>,
) {
  const allowed = new Set([
    'provider_stage',
    'provider_job_id',
    'progress',
    'input_metadata',
    'output_metadata',
    'output_object_key',
    'output_size_bytes',
    'completion_started',
  ]);
  const entries = Object.entries(fields);
  if (entries.some(([key]) => !allowed.has(key)))
    throw new Error('Invalid worker field');
  const r = await db.query(
    `update video_jobs set ${entries.map(([key], i) => `${key}=$${i + 3}`).join(',')},lease_expires_at=now()+interval '60 seconds' where id=$1 and worker_id=$2 and status='processing' and not cancel_requested returning id`,
    [id, workerId, ...entries.map(([, v]) => v)],
  );
  if (!r.rowCount)
    throw new AppError(
      'LEASE_LOST',
      'Processing was cancelled or the worker lease was lost.',
      409,
    );
}
