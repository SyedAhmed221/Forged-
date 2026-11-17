import { Pool, type PoolClient } from 'pg';
import { databaseOptions } from '../../../../packages/shared/src/database';

export type PackOrder = {
  id: string;
  paypal_order_id: string;
  capture_id: string | null;
  product_id: string;
  product_name: string;
  file_key: string;
  download_name: string;
  price_minor: number;
  currency: string;
  buyer_email: string | null;
  status: 'pending' | 'paid' | 'refunded' | 'reversed';
  paid_at: Date | null;
  expires_at: Date | null;
  receipt_sent_at: Date | null;
};

let pool: Pool | undefined;
export function packDb() {
  if (!process.env.PACKS_DATABASE_URL)
    throw new Error('Packs database is not configured');
  return (pool ??= new Pool({
    ...databaseOptions(
      process.env.PACKS_DATABASE_URL,
      process.env.PACKS_DATABASE_CA_CERT_PEM,
    ),
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
  }));
}

export async function packTransaction<T>(run: (db: PoolClient) => Promise<T>) {
  const db = await packDb().connect();
  try {
    await db.query('begin');
    const result = await run(db);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}

export async function transitionCapture(
  db: PoolClient,
  order: PackOrder,
  captureId: string,
  email: string,
  days: number,
) {
  await db.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `packs:capture:${captureId}`,
  ]);
  const revoked = await db.query(
    'select status from forge_packs.revoked_captures where capture_id=$1',
    [captureId],
  );
  const result = await db.query<PackOrder>(
    `update forge_packs.orders set capture_id=$2, buyer_email=$3, status=$4,
       paid_at=now(), expires_at=now()+make_interval(days => $5),
       revoked_at=case when $4='paid' then null else now() end
     where id=$1 and status='pending'
     returning *`,
    [
      order.id,
      captureId,
      email.toLowerCase(),
      revoked.rows[0]?.status ?? 'paid',
      days,
    ],
  );
  if (result.rows[0]) return result.rows[0];
  const existing = await db.query<PackOrder>(
    'select * from forge_packs.orders where id=$1 and capture_id=$2',
    [order.id, captureId],
  );
  if (!existing.rows[0]) throw new Error('Capture does not match stored order');
  return existing.rows[0];
}

export async function revokeCapture(
  captureId: string,
  status: 'refunded' | 'reversed',
) {
  return packTransaction(async (db) => {
    await db.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `packs:capture:${captureId}`,
    ]);
    await db.query(
      `insert into forge_packs.revoked_captures(capture_id,status) values($1,$2)
       on conflict(capture_id) do update set status='reversed' where excluded.status='reversed'`,
      [captureId, status],
    );
    await db.query(
      `update forge_packs.orders set status=$2, revoked_at=coalesce(revoked_at,now())
       where capture_id=$1 and (status='paid' or (status='refunded' and $2='reversed'))`,
      [captureId, status],
    );
  });
}
