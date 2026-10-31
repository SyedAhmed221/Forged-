import { Pool, type PoolClient } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@tikquick/shared';
import { databaseOptions } from '../../../packages/shared/src/database';
let pool: Pool;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new AppError(
      'CONFIGURATION_REQUIRED',
      'Connect your Supabase and storage services to use the studio.',
      503,
    );
  return (pool ??= new Pool({
    ...databaseOptions(
      process.env.DATABASE_URL,
      process.env.SUPABASE_CA_CERT_PEM,
    ),
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  }));
}
export async function user(request: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    throw new AppError(
      'CONFIGURATION_REQUIRED',
      'Sign-in is not configured yet.',
      503,
    );
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user)
    throw new AppError(
      'UNAUTHENTICATED',
      'Your session has expired. Please sign in.',
      401,
    );
  return data.user;
}
export async function transaction<T>(
  userId: string,
  fn: (db: PoolClient) => Promise<T>,
) {
  const db = await database().connect();
  try {
    await db.query('begin');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId,
    ]);
    const result = await fn(db);
    await db.query('commit');
    return result;
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    db.release();
  }
}
export async function rateLimit(userId: string) {
  return transaction(userId, async (db) => {
    const r = await db.query(
      "insert into api_rate_limits(user_id,window_start) values($1,date_trunc('minute',now())) on conflict(user_id,window_start) do update set requests=api_rate_limits.requests+1 returning requests",
      [userId],
    );
    return Number(r.rows[0].requests) <= 90;
  });
}
export function endpoint(
  fn: (request: Request, userId: string) => Promise<unknown>,
) {
  return async (request: Request) => {
    try {
      const identity = await user(request);
      if (!(await rateLimit(identity.id)))
        throw new AppError(
          'RATE_LIMITED',
          'Too many requests. Try again in a minute.',
          429,
        );
      return NextResponse.json(await fn(request, identity.id), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      const error =
        e instanceof AppError
          ? e
          : e instanceof ZodError
            ? new AppError('INVALID_REQUEST', 'Check your request fields.')
            : new AppError(
                'INTERNAL_ERROR',
                'The request could not be completed. Try again.',
                500,
              );
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
            ...(error.status === 429 ? { 'Retry-After': '60' } : {}),
          },
        },
      );
    }
  };
}
export const publicColumns =
  'id,filename,status,input_size_bytes::float8,output_size_bytes::float8,input_metadata,output_metadata,use_encoder,provider_stage,progress,error_code,error_message,created_at,expires_at,cancel_requested';
export async function ownJob(
  db: PoolClient,
  id: string,
  userId: string,
  lock = false,
) {
  const result = await db.query(
    `select * from video_jobs where id=$1 and user_id=$2${lock ? ' for update' : ''}`,
    [id, userId],
  );
  if (!result.rowCount)
    throw new AppError('NOT_FOUND', 'Video not found.', 404);
  return result.rows[0];
}
