import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AppError,
  MAX_INPUT_BYTES,
  uploadSchema,
  idSchema,
} from '@tikquick/shared';
import {
  presignUpload,
  sealUpload,
  downloadUrl,
} from '../../../packages/shared/src/storage';
import { transaction, ownJob, publicColumns } from './server';
export const dailyQuota = () =>
  Math.max(1, Number(process.env.DAILY_JOB_LIMIT || 10));
export const inputLimit = () =>
  Math.min(
    1_500_000_000,
    Number(process.env.MAX_INPUT_BYTES || MAX_INPUT_BYTES),
  );
export async function createUpload(request: Request, userId: string) {
  const data = uploadSchema.parse(await request.json());
  if (data.size > inputLimit())
    throw new AppError(
      'FILE_TOO_LARGE',
      'This video exceeds the configured upload limit.',
    );
  return transaction(userId, async (db) => {
    await db.query(
      'insert into profiles(id) values($1) on conflict do nothing',
      [userId],
    );
    const usage = await db.query(
      "insert into usage_counters(user_id,usage_date,submitted_jobs) values($1,(now() at time zone 'UTC')::date,1) on conflict(user_id,usage_date) do update set submitted_jobs=usage_counters.submitted_jobs+1 where usage_counters.submitted_jobs<$2 returning submitted_jobs",
      [userId, dailyQuota()],
    );
    if (!usage.rowCount)
      throw new AppError(
        'QUOTA_EXCEEDED',
        'You have reached your daily video allowance.',
        429,
      );
    const id = randomUUID();
    const pending = `pending/${userId}/${id}`;
    const source = `source/${userId}/${id}`;
    const url = await presignUpload(pending, data.size);
    await db.query(
      "insert into video_jobs(id,user_id,filename,source_object_key,pending_object_key,input_size_bytes,use_encoder,expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')",
      [id, userId, data.filename, source, pending, data.size, data.use_encoder],
    );
    return { id, url, expires_in: 600 };
  });
}
export async function completeUpload(request: Request, userId: string) {
  const { id } = z.object({ id: idSchema }).parse(await request.json());
  return transaction(userId, async (db) => {
    const job = await ownJob(db, id, userId, true);
    if (job.status === 'uploaded' || job.status === 'queued')
      return { id, status: job.status };
    if (
      job.status !== 'uploading' ||
      new Date(job.expires_at).getTime() <= Date.now()
    )
      throw new AppError(
        'INVALID_STATE',
        'This upload is no longer available.',
        409,
      );
    await sealUpload(
      job.pending_object_key,
      job.source_object_key,
      Number(job.input_size_bytes),
    );
    await db.query(
      "update video_jobs set status='uploaded',provider_stage='uploaded' where id=$1",
      [id],
    );
    await db.query(
      "update usage_counters set uploaded_bytes=uploaded_bytes+$2 where user_id=$1 and usage_date=($3::timestamptz at time zone 'UTC')::date",
      [userId, job.input_size_bytes, job.created_at],
    );
    return { id, status: 'uploaded' };
  });
}
export async function jobAction(
  id: string,
  action: string,
  method: string,
  userId: string,
) {
  idSchema.parse(id);
  return transaction(userId, async (db) => {
    const job = await ownJob(db, id, userId, method !== 'GET');
    if (action === 'start' && method === 'POST') {
      if (['queued', 'processing', 'completed'].includes(job.status))
        return { id, status: job.status };
      if (
        job.status !== 'uploaded' ||
        new Date(job.expires_at).getTime() <= Date.now()
      )
        throw new AppError(
          'INVALID_STATE',
          'Upload the video before starting.',
          409,
        );
      await db.query(
        "update video_jobs set status='queued',provider_stage='queued' where id=$1",
        [id],
      );
      return { id, status: 'queued' };
    }
    if (action === 'cancel' && method === 'POST') {
      await db.query(
        "update video_jobs set cancel_requested=true,status=case when status in ('uploading','uploaded','queued') then 'cancelled' else status end where id=$1 and status in ('uploading','uploaded','queued','processing')",
        [id],
      );
      return { id, cancel_requested: true };
    }
    if (action === 'download' && method === 'GET') {
      if (
        job.status !== 'completed' ||
        !job.output_object_key ||
        new Date(job.expires_at).getTime() <= Date.now()
      )
        throw new AppError('NOT_READY', 'This download is not available.', 409);
      return {
        url: await downloadUrl(job.output_object_key, job.filename),
        expires_in: 60,
      };
    }
    if (!action && method === 'DELETE') {
      await db.query(
        "update video_jobs set status='deleting',cancel_requested=true where id=$1",
        [id],
      );
      return { id, status: 'deleting' };
    }
    if (!action && method === 'GET') {
      const r = await db.query(
        `select ${publicColumns} from video_jobs where id=$1 and user_id=$2`,
        [id, userId],
      );
      return r.rows[0];
    }
    throw new AppError('NOT_FOUND', 'Route not found.', 404);
  });
}
export async function listJobs(request: Request, userId: string) {
  const before = new URL(request.url).searchParams.get('before');
  if (before) z.iso.datetime({ offset: true }).parse(before);
  return transaction(userId, async (db) => {
    const r = await db.query(
      `select ${publicColumns} from video_jobs where user_id=$1 and ($2::timestamptz is null or created_at<$2::timestamptz) order by created_at desc limit 50`,
      [userId, before],
    );
    return {
      jobs: r.rows,
      next_cursor: r.rows.length === 50 ? r.rows[49].created_at : null,
    };
  });
}
export async function usage(_request: Request, userId: string) {
  return transaction(userId, async (db) => {
    const r = await db.query(
      "select submitted_jobs,completed_jobs,uploaded_bytes::float8,processed_bytes::float8 from usage_counters where user_id=$1 and usage_date=(now() at time zone 'UTC')::date",
      [userId],
    );
    return {
      ...(r.rows[0] || {
        submitted_jobs: 0,
        completed_jobs: 0,
        uploaded_bytes: 0,
        processed_bytes: 0,
      }),
      daily_limit: dailyQuota(),
      max_input_bytes: inputLimit(),
      resets_at: '00:00 UTC',
    };
  });
}
