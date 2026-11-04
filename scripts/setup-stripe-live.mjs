// Provision Stripe live resources. Prints only public resource IDs, never keys.
import { mkdir, writeFile } from 'node:fs/promises';
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith('sk_live_'))
  throw new Error('A Stripe live secret key is required.');
async function call(path, fields, idempotency) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
    },
    body: new URLSearchParams(fields),
  });
  if (!response.ok)
    throw new Error(`Stripe setup request failed (${response.status}).`);
  return response.json();
}
const product = await call(
  'products',
  { name: 'Forge Quality Premium', 'metadata[application]': 'forged' },
  'forged-premium-product-v1',
);
const settings = { STRIPE_SECRET_KEY: key };
const plans = [
  ['MONTHLY', 900, 1],
  ['QUARTERLY', 2400, 3],
  ['HALFYEARLY', 4600, 6],
  ['YEARLY', 8000, 12],
];
for (const [name, amount, months] of plans) {
  const price = await call(
    'prices',
    {
      product: product.id,
      currency: 'gbp',
      unit_amount: String(amount),
      'recurring[interval]': 'month',
      'recurring[interval_count]': String(months),
      lookup_key: `forged_premium_${name.toLowerCase()}_v1`,
    },
    `forged-premium-price-${name}-v1`,
  );
  console.log(`STRIPE_PRICE_${name}=${price.id}`);
  settings[`STRIPE_PRICE_${name}`] = price.id;
}
await call(
  'billing_portal/configurations',
  {
    'business_profile[headline]': 'Manage your Forge Quality subscription',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
  },
  'forged-premium-portal-v1',
);
console.log(
  'Stripe live products, recurring prices and cancellation portal configured.',
);
const webhook = await call('webhook_endpoints', {
  url: 'https://forged-gamma.vercel.app/api/billing/webhook',
  'enabled_events[0]': 'customer.subscription.created',
  'enabled_events[1]': 'customer.subscription.updated',
  'enabled_events[2]': 'customer.subscription.deleted',
}, 'forged-premium-webhook-v1');
if (!webhook.secret) throw new Error('Webhook signing secret was not returned.');
settings.STRIPE_WEBHOOK_SECRET = webhook.secret;
await mkdir('.tmp/billing', { recursive: true });
await writeFile('.tmp/billing/stripe-live.json', JSON.stringify(settings), { mode: 0o600 });
console.log('Private live settings saved in the ignored local billing directory.');
