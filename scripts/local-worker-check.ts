import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID, randomBytes } from 'node:crypto';
import { storage, bucket } from '../packages/shared/src/storage';
import { inspectMedia } from '../services/worker/src/media';
import { parseOTU } from '../services/worker/src/providers/tikquick';
const exec = promisify(execFile);
const mediaOnly = process.argv.includes('--media-only');
const externalOnly = process.argv.includes('--external-only');
const required = [
  'WORKER_DATABASE_URL',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'TIKQUICK_API_KEY',
];
const missing = required.filter(
  (key) =>
    !(externalOnly && key === 'WORKER_DATABASE_URL') &&
    !process.env[key]?.trim(),
);
const dir = await mkdtemp(join(tmpdir(), 'forged-preflight-'));
let stage = 'local_media_tools';
try {
  const sample = join(dir, 'sample.mp4');
  await exec(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      sample,
    ],
    { timeout: 30000 },
  );
  const media = await inspectMedia(sample, AbortSignal.timeout(30000), true);
  console.log(
    JSON.stringify({
      check: 'local_media_tools',
      ok: true,
      duration: media.duration,
      tracks: media.streams.map((s) => s.codec_type),
    }),
  );
  if (mediaOnly) process.exitCode = 0;
  else if (missing.length) {
    console.log(JSON.stringify({ check: 'configuration', ok: false, missing }));
    process.exitCode = 2;
  } else {
    if (!externalOnly) {
      stage = 'database';
      const pool = new Pool({
        connectionString: process.env.WORKER_DATABASE_URL,
        connectionTimeoutMillis: 10000,
        max: 1,
      });
      try {
        const result = await pool.query(
          "select current_user as role,has_table_privilege(current_user,'public.video_jobs','select') as can_read_jobs,has_table_privilege(current_user,'public.video_jobs','update') as can_update_jobs",
        );
        const data = result.rows[0];
        if (
          data.role !== 'forged_worker' ||
          !data.can_read_jobs ||
          !data.can_update_jobs
        )
          throw new Error('Restricted worker role is not configured correctly');
        console.log(
          JSON.stringify({ check: 'database', ok: true, role: data.role }),
        );
      } finally {
        await pool.end();
      }
    }
    stage = 'provider_health';
    const response = await fetch(
      `${process.env.TIKQUICK_PS_URL || 'https://byte.tikqcapi.site'}/api/psver`,
      { redirect: 'error', signal: AbortSignal.timeout(10000) },
    );
    const status = await response.json();
    if (!response.ok || status.online !== true)
      throw new Error('Provider is not reporting online');
    console.log(JSON.stringify({ check: 'provider_health', ok: true }));
    stage = 'provider_key';
    const otuUrl = new URL(
      '/passport/api/thirdparty/genotu',
      process.env.TIKQUICK_PASSPORT_URL || 'https://tikquick.online',
    );
    otuUrl.searchParams.set('key', process.env.TIKQUICK_API_KEY!);
    const otuResponse = await fetch(otuUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!otuResponse.ok)
      throw Object.assign(new Error('Provider rejected the key'), {
        code: `PROVIDER_HTTP_${otuResponse.status}`,
      });
    parseOTU(await otuResponse.json());
    // The generated token is deliberately discarded; every real job mints its own.
    console.log(JSON.stringify({ check: 'provider_key', ok: true }));
    stage = 'private_storage_roundtrip';
    const key = `pending/local-worker-check/${randomUUID()}`;
    const bytes = randomBytes(64);
    try {
      await storage().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: bytes,
          ContentType: 'application/octet-stream',
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      const stored = await storage().send(
        new HeadObjectCommand({ Bucket: bucket(), Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      const response = await storage().send(
        new GetObjectCommand({ Bucket: bucket(), Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      const body = await response.Body!.transformToByteArray();
      if (stored.ContentLength !== 64 || !Buffer.from(body).equals(bytes))
        throw new Error('Storage roundtrip failed');
      console.log(
        JSON.stringify({ check: 'private_storage_roundtrip', ok: true }),
      );
    } finally {
      await storage().send(
        new DeleteObjectCommand({ Bucket: bucket(), Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
    }
    console.log(
      'Local prerequisites passed. No video has been submitted to TikQuick.',
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      check: stage,
      ok: false,
      code:
        typeof error === 'object' && error && 'code' in error
          ? String(error.code)
          : 'CHECK_FAILED',
      message:
        'A prerequisite check failed. Credential values and connection URLs have been omitted.',
    }),
  );
  process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
