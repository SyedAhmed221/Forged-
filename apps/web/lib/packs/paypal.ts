import { z } from 'zod';
import { paypalIdSchema } from './security';

function base() {
  const environment = process.env.PAYPAL_ENV;
  if (environment === 'live') return 'https://api-m.paypal.com';
  if (environment === 'sandbox') return 'https://api-m.sandbox.paypal.com';
  throw new Error('PayPal environment is required');
}

export function checkoutEnabled() {
  return (
    process.env.PACKS_CHECKOUT_ENABLED === 'true' &&
    ['live', 'sandbox'].includes(process.env.PAYPAL_ENV ?? '') &&
    Boolean(
      process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_WEBHOOK_ID &&
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

export async function paypalRequest(
  path: string,
  body?: unknown,
  requestId?: string,
) {
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString('base64');
  const oauth = await fetch(base() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  if (!oauth.ok) throw new Error('PayPal authentication failed');
  const { access_token } = z
    .object({ access_token: z.string().min(1) })
    .parse(await oauth.json());
  return fetch(base() + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
    cache: 'no-store',
  });
}

export const moneySchema = z.object({
  value: z.string(),
  currency_code: z.string(),
});
export const captureSchema = z.object({
  id: paypalIdSchema,
  status: z.string(),
  amount: moneySchema,
});
export const paypalOrderSchema = z.object({
  id: paypalIdSchema,
  status: z.string(),
  payer: z.object({ email_address: z.email().optional() }).optional(),
  payment_source: z
    .object({
      paypal: z.object({ email_address: z.email().optional() }).optional(),
    })
    .optional(),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string(),
        payments: z.object({ captures: z.array(captureSchema) }).optional(),
      }),
    )
    .length(1),
});

export function matchesPrice(
  amount: z.infer<typeof moneySchema>,
  priceMinor: number,
  currency: string,
) {
  return (
    Number.isSafeInteger(priceMinor) &&
    priceMinor > 0 &&
    amount.currency_code === currency &&
    amount.value === decimalAmount(priceMinor)
  );
}

export function decimalAmount(priceMinor: number) {
  return `${Math.floor(priceMinor / 100)}.${String(priceMinor % 100).padStart(2, '0')}`;
}

export async function verifyWebhook(headers: Headers, event: unknown) {
  const signature = {
    auth_algo: headers.get('paypal-auth-algo'),
    cert_url: headers.get('paypal-cert-url'),
    transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'),
    transmission_time: headers.get('paypal-transmission-time'),
  };
  if (
    Object.values(signature).some((value) => !value) ||
    !process.env.PAYPAL_WEBHOOK_ID
  )
    return false;
  const response = await paypalRequest(
    '/v1/notifications/verify-webhook-signature',
    {
      ...signature,
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  );
  if (!response.ok) throw new Error('PayPal webhook verification unavailable');
  const result = await response.json();
  return result.verification_status === 'SUCCESS';
}
