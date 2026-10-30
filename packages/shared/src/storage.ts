import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { AppError } from './index';
let client: S3Client;
export function storage() {
  return (client ??= new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));
}
export function bucket() {
  if (!process.env.R2_BUCKET_NAME)
    throw new AppError(
      'CONFIGURATION_REQUIRED',
      'Storage has not been configured.',
      503,
    );
  return process.env.R2_BUCKET_NAME;
}
export async function presignUpload(key: string, size: number) {
  return getSignedUrl(
    storage(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: 'application/octet-stream',
      ContentLength: size,
    }),
    { expiresIn: 600 },
  );
}
export async function head(key: string) {
  return storage().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function sealUpload(
  pending: string,
  sealed: string,
  size: number,
) {
  const object = await head(pending);
  if (object.ContentLength !== size)
    throw new AppError('SIZE_MISMATCH', 'Uploaded file size does not match.');
  await storage().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      Key: sealed,
      CopySource: encodeURIComponent(`${bucket()}/${pending}`).replace(
        /%2F/g,
        '/',
      ),
      CopySourceIfMatch: object.ETag,
    }),
  );
  const frozen = await head(sealed);
  if (frozen.ContentLength !== size)
    throw new AppError('SIZE_MISMATCH', 'Stored file size does not match.');
  await remove(pending);
}
export async function remove(key: string) {
  await storage().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function downloadUrl(key: string, filename: string) {
  return getSignedUrl(
    storage(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="optimized.mp4"; filename*=UTF-8''${encodeURIComponent(filename.replace(/\.[^.]+$/, '.mp4'))}`,
    }),
    { expiresIn: 60 },
  );
}
export async function toFile(key: string, path: string, signal: AbortSignal) {
  const r = await storage().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { abortSignal: signal },
  );
  if (!r.Body)
    throw new AppError('OBJECT_MISSING', 'Stored file is missing', 502);
  await pipeline(r.Body as Readable, createWriteStream(path), { signal });
}
export async function storeOutput(
  response: Response,
  key: string,
  signal: AbortSignal,
  progress: (bytes: number) => Promise<void>,
) {
  if (!response.body)
    throw new AppError(
      'EMPTY_OUTPUT',
      'Provider returned an empty result',
      502,
    );
  let bytes = 0,
    last = 0;
  const max = Number(process.env.MAX_OUTPUT_BYTES || 1073741824);
  const abort = new AbortController();
  const combined = AbortSignal.any([signal, abort.signal]);
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => abort.abort(new Error('Output stream stalled')),
      120000,
    );
  };
  arm();
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      arm();
      bytes += chunk.length;
      if (bytes > max) return callback(new Error('Output size limit exceeded'));
      if (Date.now() - last > 1000) {
        last = Date.now();
        progress(bytes).then(
          () => callback(null, chunk),
          () => callback(new Error('Lost worker lease')),
        );
      } else callback(null, chunk);
    },
  });
  const upload = new Upload({
    client: storage(),
    params: {
      Bucket: bucket(),
      Key: key,
      Body: meter,
      ContentType: 'video/mp4',
    },
    partSize: 8 * 1024 * 1024,
    queueSize: 2,
    leavePartsOnError: false,
  });
  const onAbort = () => {
    void upload.abort();
    meter.destroy(new Error('Output interrupted'));
  };
  combined.addEventListener('abort', onAbort, { once: true });
  try {
    const results = await Promise.allSettled([
      pipeline(
        Readable.fromWeb(
          response.body as import('node:stream/web').ReadableStream<Uint8Array>,
        ),
        meter,
        { signal: combined },
      ).catch((e) => {
        abort.abort();
        throw e;
      }),
      upload.done().catch((e) => {
        abort.abort();
        throw e;
      }),
    ]);
    const failure = results.find((r) => r.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    const object = await head(key);
    if (!bytes || object.ContentLength !== bytes)
      throw new AppError('EMPTY_OUTPUT', 'Output verification failed', 502);
    await progress(bytes);
    return bytes;
  } catch (e) {
    await upload.abort().catch(() => {});
    await remove(key).catch(() => {});
    throw e;
  } finally {
    clearTimeout(timer!);
    combined.removeEventListener('abort', onAbort);
  }
}
