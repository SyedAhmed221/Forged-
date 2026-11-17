import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { packPrice } from './catalog';
import { orderToken } from './security';
import { deliveryConsent } from './legal';
import { packSupport, packSeller } from './policies';
import { packDb, type PackOrder } from './store';

function positiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : fallback;
}

export const accessDays = () =>
  positiveInteger(process.env.PACKS_DOWNLOAD_DAYS, 30, 365);
export const downloadLimit = () =>
  positiveInteger(process.env.PACKS_DOWNLOAD_LIMIT, 10, 100);
export function signingSecret() {
  const secret = process.env.PACKS_DOWNLOAD_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error('Download secret must be at least 32 bytes');
  return secret;
}

export function downloadPage(id: string) {
  return `/packs/download#${id}.${orderToken(signingSecret(), 'download', id)}`;
}

let storage: S3Client | undefined;
export async function signPack(order: PackOrder) {
  if (
    !process.env.PACKS_R2_ENDPOINT ||
    !process.env.PACKS_R2_BUCKET ||
    !process.env.PACKS_R2_ACCESS_KEY_ID ||
    !process.env.PACKS_R2_SECRET_ACCESS_KEY
  )
    throw new Error('Packs storage is not configured');
  storage ??= new S3Client({
    region: 'auto',
    endpoint: process.env.PACKS_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.PACKS_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.PACKS_R2_SECRET_ACCESS_KEY,
    },
  });
  return getSignedUrl(
    storage,
    new GetObjectCommand({
      Bucket: process.env.PACKS_R2_BUCKET,
      Key: order.file_key,
      ResponseContentDisposition: `attachment; filename="${order.download_name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`,
    }),
    { expiresIn: 60 },
  );
}

export async function sendReceipt(order: PackOrder, key: string) {
  const origin = new URL(process.env.PACKS_APP_URL!);
  const link = new URL(downloadPage(order.id), origin).href;
  const label = packPrice({
    priceMinor: order.price_minor,
    currency: order.currency as 'GBP' | 'USD' | 'EUR',
  });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${process.env.PACKS_RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      from: process.env.PACKS_RECEIPT_FROM,
      reply_to: packSupport,
      to: [order.buyer_email],
      subject: 'Your Forge Quality pack receipt',
      text: `${packSeller}\nSupport: ${packSupport}\nOrder ${order.id}\n${order.product_name}\nPaid: ${label}\n\nDownload: ${link}\nAccess expires: ${order.expires_at?.toISOString()}\n\nYour checkout confirmation: ${deliveryConsent}\nTerms: ${new URL('/packs/terms', origin)}\nRefunds: ${new URL('/packs/refunds', origin)}`,
    }),
  });
  if (!response.ok) throw new Error('Receipt delivery failed');
}

export async function sendInitialReceipt(order: PackOrder) {
  if (order.status !== 'paid') return false;
  if (order.receipt_sent_at) return true;
  // Resend deduplicates requests for 24 hours. Bound automated retries to that window.
  const eligible = await packDb().query(
    `update forge_packs.orders set receipt_started_at=coalesce(receipt_started_at,now())
     where id=$1 and status='paid' and receipt_sent_at is null
       and (receipt_started_at is null or receipt_started_at > now()-interval '23 hours')
     returning id`,
    [order.id],
  );
  if (!eligible.rowCount) return false;
  await sendReceipt(order, `forge-packs-receipt-${order.id}`);
  await packDb().query(
    'update forge_packs.orders set receipt_sent_at=coalesce(receipt_sent_at,now()) where id=$1',
    [order.id],
  );
  return true;
}
