import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { type PoolClient } from 'pg';
import { AppError } from '@tikquick/shared';
import {
  storeOutput,
  toFile,
  remove,
} from '../../../packages/shared/src/storage';
import { TikQuick } from './providers/tikquick';
import { inspectMedia } from './media';
import { inspectProviderMedia } from './provider-media';
import {
  claim,
  workerPool,
  workerId,
  updateJob,
  type ClaimedJob,
} from './queue';

if (!process.env.WORKER_DATABASE_URL || !process.env.TIKQUICK_API_KEY)
  throw new Error('Worker configuration is missing');
const provider = new TikQuick({
  key: process.env.TIKQUICK_API_KEY,
  passport: process.env.TIKQUICK_PASSPORT_URL,
  ps: process.env.TIKQUICK_PS_URL,
  encoder: process.env.TIKQUICK_ENCODER_URL,
  chunkBytes: Number(process.env.TIKQUICK_CHUNK_BYTES || 20971520),
  concurrency: Number(process.env.TIKQUICK_CHUNK_CONCURRENCY || 2),
  attempts: Number(process.env.TIKQUICK_CHUNK_MAX_ATTEMPTS || 5),
  retryBaseMs: Number(process.env.TIKQUICK_CHUNK_RETRY_BASE_MS || 600),
});
const stop = new AbortController();
let active: AbortController | undefined;
let dbHealthy = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    stop.abort();
    active?.abort();
  });
let healthCache: { at: number; online: boolean } | undefined;
let checking: Promise<boolean> | undefined;
async function providerHealth() {
  if (healthCache && Date.now() - healthCache.at < 60000)
    return healthCache.online;
  return (checking ??= fetch(`${provider.ps}/api/psver`, {
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  })
    .then(async (r) => r.ok && (await r.json()).online === true)
    .catch(() => false)
    .then((online) => {
      healthCache = { at: Date.now(), online };
      return online;
    })
    .finally(() => {
      checking = undefined;
    }));
}
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/healthz') {
    res.statusCode = dbHealthy && !stop.signal.aborted ? 200 : 503;
    res.end(JSON.stringify({ ok: res.statusCode === 200 }));
    return;
  }
  if (
    req.url === '/internal/provider-health' &&
    process.env.INTERNAL_HEALTH_TOKEN &&
    req.headers.authorization === `Bearer ${process.env.INTERNAL_HEALTH_TOKEN}`
  ) {
    res.end(JSON.stringify({ online: await providerHealth() }));
    return;
  }
  res.statusCode = 404;
  res.end('{}');
}).listen(
  Number(process.env.PORT || 8080),
  process.env.WORKER_BIND_HOST || '0.0.0.0',
);

async function processJob(db: PoolClient, job: ClaimedJob) {
  const controller = new AbortController();
  active = controller;
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(60 * 60 * 1000),
  ]);
  const disconnected = () => controller.abort();
  db.on('error', disconnected);
  const heartbeat = setInterval(() => {
    void db
      .query(
        "update video_jobs set lease_expires_at=now()+interval '60 seconds' where id=$1 and worker_id=$2 and status='processing' and not cancel_requested returning id",
        [job.id, workerId],
      )
      .then((r) => {
        if (!r.rowCount) controller.abort();
      })
      .catch(() => controller.abort());
  }, 10000);
  const dir = await mkdtemp(join(tmpdir(), 'forged-'));
  const outputKey = `output/${job.user_id}/${job.id}.mp4`;
  let completionStarted = false;
  let outputValidationStarted = false;
  try {
    await toFile(job.source_object_key, join(dir, 'source'), signal);
    const input = await inspectMedia(join(dir, 'source'), signal);
    await updateJob(db, job.id, { input_metadata: input });
    const hooks = {
      signal,
      progress: async (p: import('./providers/tikquick').ProviderProgress) => {
        const { stage, provider_job_id, ...progress } = p;
        await updateJob(db, job.id, {
          provider_stage: stage,
          progress,
          ...(provider_job_id ? { provider_job_id } : {}),
        });
      },
      beforeComplete: async () => {
        await updateJob(db, job.id, { completion_started: true });
        completionStarted = true;
      },
    };
    const source = {
      path: join(dir, 'source'),
      filename: job.filename,
      size: Number(job.input_size_bytes),
    };
    const response = job.use_encoder
      ? await provider.encoded(source, hooks)
      : await provider.standard(source, hooks);
    const bytes = await storeOutput(
      response,
      outputKey,
      signal,
      async (received_bytes) => {
        await updateJob(db, job.id, {
          provider_stage: 'receiving',
          progress: { received_bytes },
        });
      },
    );
    await updateJob(db, job.id, { provider_stage: 'verifying' });
    await toFile(outputKey, join(dir, 'output.mp4'), signal);
    outputValidationStarted = true;
    const output = await inspectProviderMedia(join(dir, 'output.mp4'), signal);
    await db.query('begin');
    try {
      const result = await db.query(
        "update video_jobs set status='completed',provider_stage='completed',output_object_key=$3,output_size_bytes=$4,output_metadata=$5,completed_at=now(),lease_expires_at=null where id=$1 and worker_id=$2 and status='processing' and not cancel_requested returning id",
        [job.id, workerId, outputKey, bytes, output],
      );
      if (!result.rowCount) throw new AppError('CANCELLED', 'Cancelled');
      await db.query(
        "update usage_counters set completed_jobs=completed_jobs+1,processed_bytes=processed_bytes+$2 where user_id=$1 and usage_date=($3::timestamptz at time zone 'UTC')::date",
        [job.user_id, bytes, job.created_at],
      );
      await db.query(
        "insert into job_events(job_id,event_type,metadata) values($1,'patcher_success',$2)",
        [job.id, { output_bytes: bytes, validated: true }],
      );
      await db.query('commit');
    } catch (e) {
      await db.query('rollback');
      throw e;
    }
  } catch (e) {
    await remove(outputKey).catch(() => {});
    const invalidOutput =
      outputValidationStarted &&
      e instanceof AppError &&
      e.code === 'INVALID_MEDIA';
    const code = invalidOutput
      ? 'OUTPUT_INVALID'
      : completionStarted
        ? 'COMPLETION_UNKNOWN'
        : e instanceof AppError
          ? e.code
          : 'PROCESSING_FAILED';
    await db
      .query(
        "update video_jobs set status=case when cancel_requested then 'cancelled' else 'failed' end,error_code=$3,error_message=$4,lease_expires_at=null where id=$1 and worker_id=$2 and status='processing'",
        [
          job.id,
          workerId,
          code,
          invalidOutput
            ? 'TikQuick returned a video that failed playback validation. The result has been withheld.'
            : completionStarted
              ? 'Completion was interrupted or the result could not be validated. Submit a new job to try again.'
              : e instanceof AppError
                ? e.message
                : 'The video could not be processed. Please try a new upload.',
        ],
      )
      .catch(() => {});
    console.error(
      JSON.stringify({ event: 'job_failed', job_id: job.id, code }),
    );
  } finally {
    clearInterval(heartbeat);
    db.off('error', disconnected);
    active = undefined;
    await rm(dir, { recursive: true, force: true });
    await db
      .query('select pg_advisory_unlock(hashtextextended($1,17))', [job.id])
      .catch(() => {});
  }
}
async function cleanup(db: PoolClient) {
  const rows = await db.query(
    "select id,user_id,source_object_key,pending_object_key,output_object_key from video_jobs where status='deleting' or expires_at<now() or (status='processing' and cancel_requested and lease_expires_at<now()) order by created_at limit 20",
  );
  for (const row of rows.rows) {
    const lock = await db.query(
      'select pg_try_advisory_lock(hashtextextended($1,17)) as ok',
      [row.id],
    );
    if (!lock.rows[0].ok) continue;
    try {
      await Promise.all(
        [
          row.source_object_key,
          row.pending_object_key,
          row.output_object_key || `output/${row.user_id}/${row.id}.mp4`,
        ].map((k) => remove(k)),
      );
      await db.query('delete from video_jobs where id=$1', [row.id]);
    } finally {
      await db.query('select pg_advisory_unlock(hashtextextended($1,17))', [
        row.id,
      ]);
    }
  }
  await db.query(
    "delete from api_rate_limits where window_start<now()-interval '1 day'",
  );
}
let lastCleanup = 0;
while (!stop.signal.aborted) {
  let db: PoolClient | undefined;
  try {
    db = await workerPool.connect();
    dbHealthy = true;
    if (Date.now() - lastCleanup > 60000) {
      await cleanup(db);
      lastCleanup = Date.now();
    }
    // One deployment-wide provider slot. More replicas are safe standbys.
    const slot = await db.query('select pg_try_advisory_lock(734211,1) as ok');
    if (slot.rows[0].ok) {
      try {
        const job = await claim(db);
        if (job) await processJob(db, job);
      } finally {
        await db.query('select pg_advisory_unlock(734211,1)');
      }
    }
  } catch {
    dbHealthy = false;
    console.error(JSON.stringify({ event: 'worker_cycle_failed' }));
  } finally {
    if (db) {
      await db.query('select pg_advisory_unlock_all()').catch(() => {});
      db.release();
    }
  }
  await delay(2000, undefined, { signal: stop.signal }).catch(() => {});
}
server.close();
await workerPool.end();
