import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripePayment } from '../apps/web/lib/packs/fulfilment';
import { verifyStripeSignature } from '../apps/web/lib/packs/stripe';
import type { PackOrder } from '../apps/web/lib/packs/store';
const order = {
  id: '4a32d8ca-93e2-4f48-83d9-64e8a1b73a14',
  stripe_checkout_id: 'cs_test_12345',
  price_minor: 7400,
  currency: 'GBP',
} as PackOrder;
const paid = {
  id: order.stripe_checkout_id,
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  livemode: false,
  client_reference_id: order.id,
  amount_total: 7400,
  currency: 'gbp',
  payment_intent: 'pi_12345',
  metadata: { application: 'forged-packs', order_id: order.id },
  customer_details: { email: 'buyer@example.com' },
};
afterEach(() => vi.unstubAllEnvs());
describe('Stripe pack payment security', () => {
  it('matches paid sessions to the stored order, price, environment and buyer', () => {
    vi.stubEnv('PACKS_STRIPE_SECRET_KEY', 'sk_test_fixture');
    expect(verifyStripePayment(order, paid)).toEqual({
      captureId: 'pi_12345',
      email: 'buyer@example.com',
    });
    for (const invalid of [
      { amount_total: 1 },
      { currency: 'usd' },
      { payment_status: 'unpaid' },
      { status: 'open' },
      { mode: 'subscription' },
      { livemode: true },
      { id: 'cs_test_other' },
      { client_reference_id: 'other' },
      { payment_intent: null },
      { customer_details: null },
      { metadata: { application: 'other', order_id: order.id } },
      { metadata: { application: 'forged-packs', order_id: 'other' } },
    ])
      expect(() =>
        verifyStripePayment(order, { ...paid, ...invalid }),
      ).toThrow();
  });
  it('checks the raw signed bytes, timestamp tolerance and signature rotation', () => {
    vi.stubEnv('PACKS_STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
    const timestamp = 1000000;
    const raw = JSON.stringify({ type: 'checkout.session.completed' });
    const sign = (text: string) =>
      createHmac('sha256', 'whsec_fixture')
        .update(timestamp + '.' + text)
        .digest('hex');
    expect(
      verifyStripeSignature(
        raw,
        't=' + timestamp + ',v1=' + sign(raw),
        timestamp * 1000,
      ),
    ).toBe(true);
    expect(
      verifyStripeSignature(
        raw + ' ',
        't=' + timestamp + ',v1=' + sign(raw),
        timestamp * 1000,
      ),
    ).toBe(false);
    expect(
      verifyStripeSignature(
        raw,
        't=' + timestamp + ',v1=' + sign(raw),
        (timestamp + 301) * 1000,
      ),
    ).toBe(false);
    expect(
      verifyStripeSignature(
        raw,
        't=' + timestamp + ',v1=bad,v1=' + sign(raw),
        timestamp * 1000,
      ),
    ).toBe(true);
    expect(verifyStripeSignature(raw, null, timestamp * 1000)).toBe(false);
  });
});
