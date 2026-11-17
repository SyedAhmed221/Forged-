import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { verifyCapture } from '../apps/web/lib/packs/fulfilment';
import { matchesPrice, verifyWebhook } from '../apps/web/lib/packs/paypal';
import { orderToken, validOrderToken } from '../apps/web/lib/packs/security';
import { transitionCapture, type PackOrder } from '../apps/web/lib/packs/store';

const order: PackOrder = {
  id: '4a32d8ca-93e2-4f48-83d9-64e8a1b73a14',
  paypal_order_id: 'ORDER1234567',
  capture_id: null,
  product_id: 'test-fixture',
  product_name: 'Test fixture',
  file_key: 'test.zip',
  download_name: 'test.zip',
  price_minor: 1299,
  currency: 'GBP',
  buyer_email: null,
  status: 'pending',
  paid_at: null,
  expires_at: null,
  receipt_sent_at: null,
};

function completed(value = '12.99', currency = 'GBP', status = 'COMPLETED') {
  return {
    id: order.paypal_order_id,
    status: 'COMPLETED',
    payer: { email_address: 'buyer@example.com' },
    purchase_units: [
      {
        reference_id: order.id,
        payments: {
          captures: [
            {
              id: 'CAPTURE12345',
              status,
              amount: { value, currency_code: currency },
            },
          ],
        },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Forge Quality Packs', () => {
  it('verifies the stored price and rejects price changes, wrong currency and pending captures', () => {
    expect(
      matchesPrice({ value: '12.99', currency_code: 'GBP' }, 1299, 'GBP'),
    ).toBe(true);
    expect(verifyCapture(order, completed())).toEqual({
      captureId: 'CAPTURE12345',
      email: 'buyer@example.com',
    });
    expect(() => verifyCapture(order, completed('0.01'))).toThrow();
    expect(() => verifyCapture(order, completed('12.99', 'USD'))).toThrow();
    expect(() =>
      verifyCapture(order, completed('12.99', 'GBP', 'PENDING')),
    ).toThrow();
    expect(() => verifyCapture(order, completed(), 'OTHERID123')).toThrow();
  });

  it('uses the original persisted download window on repeated fulfilment', async () => {
    const saved = {
      ...order,
      status: 'paid',
      capture_id: 'CAPTURE12345',
      expires_at: new Date('2027-01-01'),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [saved] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [saved] });
    const db = { query } as unknown as PoolClient;
    const first = await transitionCapture(
      db,
      order,
      'CAPTURE12345',
      'buyer@example.com',
      30,
    );
    const retry = await transitionCapture(
      db,
      order,
      'CAPTURE12345',
      'buyer@example.com',
      30,
    );
    expect(first).toEqual(retry);
    expect(query.mock.calls[5][0]).toContain(
      "where id=$1 and status='pending'",
    );
    expect(query.mock.calls[6][1]).toEqual([order.id, 'CAPTURE12345']);
  });

  it('records an earlier refund rather than granting access', async () => {
    const refunded = {
      ...order,
      status: 'refunded',
      capture_id: 'CAPTURE12345',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'refunded' }] })
      .mockResolvedValueOnce({ rows: [refunded] });
    await expect(
      transitionCapture(
        { query } as unknown as PoolClient,
        order,
        'CAPTURE12345',
        'buyer@example.com',
        30,
      ),
    ).resolves.toMatchObject({ status: 'refunded' });
    expect(query.mock.calls[2][1][3]).toBe('refunded');
  });

  it('rejects damaged, wrong-order and checkout tokens for downloads', () => {
    const secret = 'test-secret-only-for-unit-testing-123';
    const token = orderToken(secret, 'download', order.id);
    expect(validOrderToken(secret, 'download', order.id, token)).toBe(true);
    expect(validOrderToken(secret, 'download', order.id, token + 'A')).toBe(
      false,
    );
    expect(validOrderToken(secret, 'download', order.id + '1', token)).toBe(
      false,
    );
    expect(
      validOrderToken(
        secret,
        'download',
        order.id,
        orderToken(secret, 'capture', order.id),
      ),
    ).toBe(false);
  });

  it('verifies webhook signatures with the configured PayPal sandbox and sends the original event', async () => {
    vi.stubEnv('PAYPAL_ENV', 'sandbox');
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'sandbox-test');
    const network = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'sandbox-token' }))
      .mockResolvedValueOnce(Response.json({ verification_status: 'SUCCESS' }))
      .mockResolvedValueOnce(Response.json({ access_token: 'sandbox-token' }))
      .mockResolvedValueOnce(Response.json({ verification_status: 'FAILURE' }));
    vi.stubGlobal('fetch', network);
    const headers = new Headers(
      Object.fromEntries(
        [
          'auth-algo',
          'cert-url',
          'transmission-id',
          'transmission-sig',
          'transmission-time',
        ].map((header) => [`paypal-${header}`, 'test']),
      ),
    );
    const event = {
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE12345' },
    };
    expect(await verifyWebhook(new Headers(), event)).toBe(false);
    expect(await verifyWebhook(headers, event)).toBe(true);
    expect(await verifyWebhook(headers, event)).toBe(false);
    expect(network.mock.calls[1][0]).toBe(
      'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
    );
    expect(JSON.parse(network.mock.calls[1][1].body)).toMatchObject({
      webhook_id: 'sandbox-test',
      webhook_event: event,
    });
  });
});
