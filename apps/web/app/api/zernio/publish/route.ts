import { z } from 'zod';
import { AppError, idSchema } from '@tikquick/shared';
import { downloadUrl } from '../../../../../../packages/shared/src/storage';
import { endpoint, transaction, ownJob } from '../../../../lib/server';
import {
  keySchema,
  accountSchema,
  creatorInfo,
  approvedMediaUrl,
  zernio,
} from '../../../../lib/zernio';

export const runtime = 'nodejs';
export const maxDuration = 300;
type ZernioPost = {
  _id: string;
  status: string;
  platforms?: { platform?: string; status?: string }[];
};

function publishStatus(post: ZernioPost) {
  const status =
    post.platforms?.find((platform) => platform.platform === 'tiktok')
      ?.status || post.status;
  if (status === 'published' || status === 'posted') return 'posted';
  if (['failed', 'cancelled', 'partial', 'deleted'].includes(status))
    return 'failed';
  return 'submitted';
}

const statusInput = z.object({ apiKey: keySchema, jobId: idSchema });

export const PATCH = endpoint(async (request, userId) => {
  const { apiKey, jobId } = statusInput.parse(await request.json());
  const postId = await transaction(userId, async (db) => {
    await ownJob(db, jobId, userId);
    const result = await db.query(
      "select metadata->>'post_id' as post_id from job_events where job_id=$1 and event_type='zernio_publish_result' order by id desc limit 1",
      [jobId],
    );
    return result.rows[0]?.post_id as string | undefined;
  });
  if (!postId)
    throw new AppError(
      'POST_UNCONFIRMED',
      'Forged has no confirmed submission reference for this video. If you already submitted it, check Zernio before posting again.',
      404,
    );
  const { post } = await zernio<{ post?: ZernioPost }>(
    apiKey,
    `/v1/posts/${encodeURIComponent(postId)}`,
    {},
    10000,
  );
  if (post?._id !== postId)
    throw new AppError(
      'POST_UNKNOWN',
      'Zernio could not confirm this post’s status.',
      502,
    );
  return { status: publishStatus(post) };
});

const input = z.object({
  apiKey: keySchema,
  jobId: idSchema,
  accountId: accountSchema,
  caption: z.string().trim().min(1).max(2200),
  privacyLevel: z.enum([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ]),
  allowComment: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  previewConfirmed: z.literal(true),
  consentGiven: z.literal(true),
});

export const POST = endpoint(async (request, userId) => {
  const data = input.parse(await request.json());
  const job = await transaction(userId, async (db) => {
    const selected = await ownJob(db, data.jobId, userId);
    if (
      selected.status !== 'completed' ||
      !selected.output_object_key ||
      new Date(selected.expires_at).getTime() <= Date.now()
    )
      throw new AppError(
        'NOT_READY',
        'Finish optimization before posting.',
        409,
      );
    const prior = await db.query(
      "select 1 from job_events where job_id=$1 and event_type='zernio_publish_started'",
      [data.jobId],
    );
    if (prior.rowCount)
      throw new AppError(
        'ALREADY_SUBMITTED',
        'This video was already sent to TikTok. Check its status in Zernio.',
        409,
      );
    return selected;
  });
  if (Number(job.output_size_bytes) > 5_000_000_000)
    throw new AppError(
      'FILE_TOO_LARGE',
      'This video exceeds Zernio’s upload limit.',
    );
  const creator = await creatorInfo(data.apiKey, data.accountId);
  if (
    !creator.canPost ||
    !creator.privacyLevels.some((p) => p.value === data.privacyLevel)
  )
    throw new AppError(
      'POST_OPTIONS',
      'Choose a privacy setting available for this TikTok account.',
      409,
    );
  if (
    creator.maxDuration &&
    job.output_metadata?.duration > creator.maxDuration
  )
    throw new AppError(
      'DURATION_LIMIT',
      'This video is longer than the TikTok account permits.',
      409,
    );
  for (const [field, selected] of Object.entries({
    allow_comment: data.allowComment,
    allow_duet: data.allowDuet,
    allow_stitch: data.allowStitch,
  }))
    if (selected && creator.interactions[field]?.enabled === false)
      throw new AppError(
        'POST_OPTIONS',
        `This TikTok account does not allow ${field.replace('_', ' ')}.`,
        409,
      );

  // Keep Forged's R2 object private. Copy the original patched bytes to
  // Zernio's temporary media storage only after the user chooses Post.
  const presigned = await zernio<{ uploadUrl: string; publicUrl: string }>(
    data.apiKey,
    '/v1/media/presign',
    {
      method: 'POST',
      body: JSON.stringify({
        filename: `${data.jobId}.mp4`,
        contentType: 'video/mp4',
        size: Number(job.output_size_bytes),
      }),
    },
  );
  const uploadUrl = new URL(presigned.uploadUrl);
  if (
    uploadUrl.protocol !== 'https:' ||
    !uploadUrl.hostname.endsWith('.r2.cloudflarestorage.com') ||
    uploadUrl.username ||
    uploadUrl.password
  )
    throw new AppError(
      'ZERNIO_MEDIA',
      'Zernio returned an unexpected upload address.',
      502,
    );
  const publicUrl = approvedMediaUrl(presigned.publicUrl, 'media.zernio.com');
  const source = await fetch(
    await downloadUrl(job.output_object_key, `${data.jobId}.mp4`),
    { redirect: 'error', signal: AbortSignal.timeout(30000) },
  );
  const sourceLength = source.headers.get('content-length');
  if (
    !source.ok ||
    !source.body ||
    (sourceLength !== null &&
      Number(sourceLength) !== Number(job.output_size_bytes))
  )
    throw new AppError(
      'MEDIA_TRANSFER',
      'The optimized video could not be read.',
      502,
    );
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(job.output_size_bytes),
    },
    body: source.body,
    duplex: 'half',
    redirect: 'error',
    signal: AbortSignal.timeout(240000),
  } as RequestInit & { duplex: 'half' });
  await uploaded.body?.cancel();
  if (!uploaded.ok)
    throw new AppError(
      'MEDIA_TRANSFER',
      'Zernio could not receive the video.',
      502,
    );

  await transaction(userId, async (db) => {
    await ownJob(db, data.jobId, userId, true);
    const inserted = await db.query(
      "insert into job_events(job_id,event_type,metadata) values($1,'zernio_publish_started',$2) on conflict do nothing returning id",
      [
        data.jobId,
        { account_id: data.accountId, privacy_level: data.privacyLevel },
      ],
    );
    if (!inserted.rowCount)
      throw new AppError(
        'ALREADY_SUBMITTED',
        'This video was already sent to TikTok. Check its status in Zernio.',
        409,
      );
  });
  // A lost response is ambiguous; never automatically submit again.
  const created = await zernio<{
    post?: ZernioPost & { platforms?: { platformPostUrl?: string }[] };
  }>(
    data.apiKey,
    '/v1/posts',
    {
      method: 'POST',
      body: JSON.stringify({
        content: data.caption,
        mediaItems: [{ type: 'video', url: publicUrl }],
        platforms: [{ platform: 'tiktok', accountId: data.accountId }],
        publishNow: true,
        tiktokSettings: {
          privacy_level: data.privacyLevel,
          allow_comment: data.allowComment,
          allow_duet: data.allowDuet,
          allow_stitch: data.allowStitch,
          content_preview_confirmed: true,
          express_consent_given: true,
        },
      }),
    },
    180000,
  );
  const post = created.post;
  if (!post?._id)
    throw new AppError(
      'POST_UNKNOWN',
      'Posting outcome is uncertain. Check Zernio before trying again.',
      502,
    );
  await transaction(userId, async (db) => {
    await db.query(
      "insert into job_events(job_id,event_type,metadata) values($1,'zernio_publish_result',$2)",
      [
        data.jobId,
        {
          post_id: post._id,
          status: post.status,
          url: post.platforms?.[0]?.platformPostUrl || null,
        },
      ],
    );
  });
  return {
    status: publishStatus(post),
  };
});
