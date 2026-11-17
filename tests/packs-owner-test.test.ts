import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../apps/web/lib/server', () => ({ user: vi.fn() }));
import { user } from '../apps/web/lib/server';
import {
  isPackTestOwner,
  requirePackTestOwner,
  ownerTestProduct,
  ownerTestEmail,
} from '../apps/web/lib/packs/owner-test';
import { verifyStripePayment } from '../apps/web/lib/packs/fulfilment';
import type { PackOrder } from '../apps/web/lib/packs/store';
const owner = {
  id: '2f0d6b29-6a12-4181-8ae2-488758dc0823',
  email: ownerTestEmail,
  email_confirmed_at: '2026-10-31',
};
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe('Private quality pack test', () => {
  it('requires the exact account, confirmed email, and a verified server identity', async () => {
    expect(isPackTestOwner(owner)).toBe(true);
    for (const other of [
      { ...owner, id: 'another-account' },
      { ...owner, email: 'another@example.com' },
      { ...owner, email_confirmed_at: undefined },
    ])
      expect(isPackTestOwner(other)).toBe(false);
    vi.mocked(user).mockResolvedValue(
      owner as Awaited<ReturnType<typeof user>>,
    );
    await expect(
      requirePackTestOwner(new Request('https://example.com')),
    ).resolves.toEqual(owner);
    vi.mocked(user).mockResolvedValue({
      ...owner,
      id: 'another-account',
    } as Awaited<ReturnType<typeof user>>);
    await expect(
      requirePackTestOwner(new Request('https://example.com')),
    ).rejects.toThrow('unavailable');
  });
  it('rejects delivery to a different checkout email and requires the exact £1 payment', () => {
    vi.stubEnv('PACKS_STRIPE_SECRET_KEY', 'sk_live_fixture');
    const order = {
      id: crypto.randomUUID(),
      stripe_checkout_id: 'cs_live_12345',
      product_id: ownerTestProduct,
      price_minor: 100,
      currency: 'GBP',
    } as PackOrder;
    const session = {
      id: order.stripe_checkout_id,
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      livemode: true,
      client_reference_id: order.id,
      amount_total: 100,
      currency: 'gbp',
      payment_intent: 'pi_12345',
      metadata: { application: 'forged-packs', order_id: order.id },
      customer_details: { email: ownerTestEmail },
    };
    expect(verifyStripePayment(order, session)).toEqual({
      captureId: 'pi_12345',
      email: ownerTestEmail,
    });
    expect(() =>
      verifyStripePayment(order, { ...session, amount_total: 1 }),
    ).toThrow();
    expect(() =>
      verifyStripePayment(order, {
        ...session,
        customer_details: { email: 'another@example.com' },
      }),
    ).toThrow();
  });
});
