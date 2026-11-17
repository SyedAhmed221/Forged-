import { createHash } from 'node:crypto';
import { AppError } from '@tikquick/shared';
import { ZodError } from 'zod';
import { packDb } from './store';

export async function readPackText(request: Request, limit = 64 * 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_REQUEST', 'Missing request body.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit)
        throw new AppError('BODY_TOO_LARGE', 'Request body is too large.', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function packsPost(handler: (request: Request) => Promise<unknown>) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      return Response.json(await handler(request), { headers });
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : error instanceof ZodError
            ? new AppError(
                'INVALID_REQUEST',
                'Check your request and try again.',
              )
            : new AppError(
                'PACKS_UNAVAILABLE',
                'The pack service is temporarily unavailable. Try again shortly.',
                503,
              );
      return Response.json(
        { error: appError.message },
        { status: appError.status, headers },
      );
    }
  };
}

export async function packRateLimit(
  request: Request,
  action: string,
  max: number,
  subject?: string,
) {
  const client = request.headers.get('x-vercel-forwarded-for') ?? 'unknown';
  const key = createHash('sha256')
    .update(`${action}:${subject ?? client}`)
    .digest('hex');
  const result = await packDb().query(
    `insert into forge_packs.rate_limits(key,window_start)
     values($1,date_trunc('minute',now())) on conflict(key,window_start)
     do update set requests=forge_packs.rate_limits.requests+1
     where forge_packs.rate_limits.requests < $2 returning requests`,
    [key, max],
  );
  if (!result.rowCount)
    throw new AppError(
      'RATE_LIMIT',
      'Too many attempts. Try again in a minute.',
      429,
    );
}

export async function readPackJson(request: Request, limit = 64 * 1024) {
  const raw = await readPackText(request, limit);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AppError('INVALID_REQUEST', 'Invalid request body.');
  }
}
