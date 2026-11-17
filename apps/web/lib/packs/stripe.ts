import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@tikquick/shared';
import { z } from 'zod';

const key = () =>
  process.env.PACKS_STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
export const packsLive = () => key()?.startsWith('sk_live_') === true;
export function checkoutEnabled() {
  return (
    process.env.PACKS_CHECKOUT_ENABLED === 'true' &&
    /^sk_(test|live)_/.test(key() ?? '') &&
    Boolean(
      process.env.PACKS_STRIPE_WEBHOOK_SECRET &&
      process.env.PACKS_DATABASE_URL &&
      process.env.PACKS_DOWNLOAD_SECRET &&
      process.env.PACKS_APP_URL &&
      process.env.PACKS_R2_ENDPOINT &&
      process.env.PACKS_R2_BUCKET &&
      process.env.PACKS_R2_ACCESS_KEY_ID &&
      process.env.PACKS_R2_SECRET_ACCESS_KEY &&
      process.env.PACKS_RESEND_API_KEY &&
      process.env.PACKS_RECEIPT_FROM,
    )
  );
}
export async function packsStripe(
  path: string,
  fields?: Record<string, string>,
  idempotency?: string,
) {
  if (!/^sk_(test|live)_/.test(key() ?? ''))
    throw new AppError('CLOSED', 'Pack payments are not configured.', 503);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key()}`,
      ...(fields
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : {}),
      ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new AppError(
      'PAYMENT_UNAVAILABLE',
      'Stripe could not complete this request. Please try again.',
      502,
    );
  return response.json() as Promise<unknown>;
}
export const sessionIdSchema = z
  .string()
  .regex(/^cs_(test|live)_[A-Za-z0-9]+$/);
export const stripeSessionSchema = z.object({
  id: sessionIdSchema,
  mode: z.string(),
  status: z.string().nullable(),
  payment_status: z.string(),
  livemode: z.boolean(),
  client_reference_id: z.string().nullable(),
  amount_total: z.number().int().nullable(),
  currency: z.string().nullable(),
  payment_intent: z
    .string()
    .regex(/^pi_[A-Za-z0-9]+$/)
    .nullable(),
  metadata: z.object({ application: z.string(), order_id: z.string() }),
  customer_details: z.object({ email: z.email().nullable() }).nullable(),
});
export function verifyStripeSignature(
  raw: string,
  header: string | null,
  now = Date.now(),
) {
  const secret = process.env.PACKS_STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) ?? '';
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  return parts
    .filter((part) => /^v1=[a-f0-9]{64}$/.test(part))
    .some((part) =>
      timingSafeEqual(Buffer.from(part.slice(3), 'hex'), expected),
    );
}
