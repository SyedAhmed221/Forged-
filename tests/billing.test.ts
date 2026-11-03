import { afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const mocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
  stripe: vi.fn(),
}));
vi.mock('../apps/web/lib/server', () => ({
  transaction: (_id: string, fn: (db: unknown) => unknown) =>
    fn({ query: mocks.query }),
}));
vi.mock('../apps/web/lib/billing', () => ({ stripe: mocks.stripe }));
import { POST } from '../apps/web/app/api/billing/webhook/route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function request(signature?: string, body = '{}') {
  return new Request('https://forged.example/api/billing/webhook', {
    method: 'POST',
    headers: signature ? { 'stripe-signature': signature } : {},
    body,
  });
}
it('rejects unsigned payment events without database writes', async () => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-signing-secret');
  expect((await POST(request())).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it('rejects correctly signed stale requests', async () => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-signing-secret');
  const t = '1';
  const signature = createHmac('sha256', 'test-signing-secret')
    .update(`${t}.{}`)
    .digest('hex');
  expect((await POST(request(`t=${t},v1=${signature}`))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it('uses current Stripe state to revoke access even when event claims active', async () => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-signing-secret');
  vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_test');
  const user = '11111111-1111-4111-8111-111111111111';
  mocks.stripe.mockResolvedValue({
    id: 'sub_test',
    customer: 'cus_test',
    status: 'canceled',
    metadata: { forged_user_id: user },
    items: {
      data: [{ price: { id: 'price_test' }, current_period_end: 2000000000 }],
    },
  });
  const body = JSON.stringify({
    livemode: false,
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_test', status: 'active' } },
  });
  const t = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'test-signing-secret')
    .update(`${t}.${body}`)
    .digest('hex');
  expect((await POST(request(`t=${t},v1=${signature}`, body))).status).toBe(
    200,
  );
  expect(mocks.query).toHaveBeenLastCalledWith(
    expect.stringContaining('update billing_accounts'),
    [user, 'cus_test', 'canceled', 'sub_test', null],
  );
});
