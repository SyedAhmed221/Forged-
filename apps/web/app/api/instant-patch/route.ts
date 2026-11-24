import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import { entitlement } from '../../../lib/billing';
import { reserveVideo } from '../../../lib/jobs';
import { inspectMp4Prefix, maxPrefixBytes } from '../../../lib/mp4-prefix';
import { endpoint, transaction } from '../../../lib/server';

export const runtime = 'nodejs';

async function boundedBody(response: Request | Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error('Body too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

const providerOptions = { cache: 'no-store', redirect: 'error' } as const;
const credentials = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  user_id: z.string().min(1).max(200),
});
const patchResponse = z.object({
  patched_prefix_b64: z
    .string()
    .min(1)
    .max(2_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  patched_prefix_size: z
    .number()
    .int()
    .positive()
    .max(maxPrefixBytes + 131072),
  client_prefix_size: z.number().int().positive(),
  ghost_sample_hex: z
    .string()
    .max(262144)
    .regex(/^(?:[0-9a-f]{2})+$/i),
  ghost_offset: z.number().int().nonnegative(),
  final_size: z.number().int().positive(),
});
class UseUpload extends Error {}

async function requestPatch(
  key: string,
  fileSize: number,
  prefix: ArrayBuffer,
  requestSignal: AbortSignal,
) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(12000)]);
  const passport = new URL(
    'https://api.tikqcapi.site/passport/api/thirdparty/genotu',
  );
  passport.searchParams.set('key', key);
  let stage = 'passport';
  let status: number | undefined;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      stage = 'passport';
      status = undefined;
      const ticket = await fetch(passport, { ...providerOptions, signal });
      status = ticket.status;
      if (!ticket.ok) {
        await ticket.body?.cancel().catch(() => {});
        throw new Error('Token unavailable');
      }
      const auth = credentials.parse(
        JSON.parse(new TextDecoder().decode(await boundedBody(ticket, 8192))),
      );
      const provider = new URL('https://byte.tikqcapi.site/api/v2/patch');
      provider.search = new URLSearchParams({
        auth_userid: auth.user_id,
        auth_token: auth.token,
        selectmethod: 'orion',
      }).toString();
      stage = 'patch';
      status = undefined;
      const response = await fetch(provider, {
        ...providerOptions,
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Original-File-Size': String(fileSize),
        },
        body: prefix,
      });
      status = response.status;
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if ([400, 413, 422, 501].includes(status)) throw new UseUpload();
        // TikQuick consumes the token even on these errors.
        if (attempt === 1 && [401, 403, 503].includes(status)) continue;
        throw new Error('Patch unavailable');
      }
      return patchResponse.parse(
        JSON.parse(
          new TextDecoder().decode(await boundedBody(response, 2_400_000)),
        ),
      );
    }
  } catch (error) {
    if (error instanceof UseUpload) throw error;
    if (!requestSignal.aborted) {
      console.warn('instant_patch_provider_failure', {
        stage,
        status,
        timedOut: signal.aborted,
      });
    }
  }
  throw new AppError(
    'PATCH_UNAVAILABLE',
    'Instant patching is temporarily unavailable. Try again or use standard upload.',
    503,
  );
}

export const POST = endpoint(async (request, userId) => {
  const key = process.env.TIKQUICK_API_KEY;
  if (!key) return { fallback: true };
  const fileSize = Number(request.headers.get('x-original-file-size'));
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0)
    throw new AppError(
      'INVALID_REQUEST',
      'The original file size is required.',
    );
  const limits = await entitlement(userId);
  if (fileSize > limits.bytes)
    throw new AppError('FILE_TOO_LARGE', 'The video exceeds your plan limit.');
  let prefix: ArrayBuffer;
  try {
    prefix = await boundedBody(request, maxPrefixBytes);
    const { width, height, fps } = inspectMp4Prefix(prefix, fileSize);
    if (
      Math.min(width, height) > limits.shortEdge ||
      Math.max(width, height) > limits.longEdge ||
      fps > limits.fps + 0.01
    )
      return { fallback: true };
  } catch {
    return { fallback: true };
  }

  try {
    return await transaction(userId, async (db) => {
      await reserveVideo(db, userId, limits.daily);
      const slot = await db.query(
        'select pg_try_advisory_xact_lock(734211,1) as acquired',
      );
      if (!slot.rows[0].acquired)
        throw new AppError(
          'PATCH_BUSY',
          'The instant patcher is busy. Try again or use standard upload.',
          409,
        );
      const patch = await requestPatch(key, fileSize, prefix, request.signal);
      const header = Buffer.from(patch.patched_prefix_b64, 'base64');
      const ghostSize = patch.ghost_sample_hex.length / 2;
      if (
        patch.client_prefix_size !== prefix.byteLength ||
        header.length !== patch.patched_prefix_size ||
        patch.ghost_offset !== header.length + fileSize - prefix.byteLength ||
        patch.final_size !== patch.ghost_offset + ghostSize
      )
        throw new UseUpload();

      await db.query(
        "update usage_counters set completed_jobs=completed_jobs+1,processed_bytes=processed_bytes+$2 where user_id=$1 and usage_date=(now() at time zone 'UTC')::date",
        [userId, patch.final_size],
      );
      return {
        fallback: false,
        prefix: header.toString('base64'),
        ghost: patch.ghost_sample_hex,
        size: patch.final_size,
      };
    });
  } catch (error) {
    if (error instanceof UseUpload) return { fallback: true };
    throw error;
  }
});
