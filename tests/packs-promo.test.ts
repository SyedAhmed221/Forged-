import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as promoPost } from '../apps/web/app/api/packs/promo/route';
import {
  packAvailable,
  packById,
  storefrontPacks,
} from '../apps/web/lib/packs/catalog';
import { sendReceipt } from '../apps/web/lib/packs/delivery';
import { verifyStripePayment } from '../apps/web/lib/packs/fulfilment';
import {
  applyPackPromo,
  findPackPromo,
  formatPackMoney,
} from '../apps/web/lib/packs/promo';
import type { PackOrder } from '../apps/web/lib/packs/store';

function promoRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/packs/promo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('Quality pack promo codes', () => {
  it('supports siv, blazedd, zoomstah, and popeyez as separate 10% off codes', () => {
    for (const code of ['siv', 'blazedd', 'zoomstah', 'popeyez']) {
      expect(findPackPromo(code)).toEqual({ code, percentOff: 10 });
      expect(findPackPromo(`  ${code.toUpperCase()}  `)).toEqual({
        code,
        percentOff: 10,
      });
    }
  });

  it('rejects unknown, empty, or combined promo codes', () => {
    for (const invalid of [
      '',
      '   ',
      null,
      undefined,
      'invalid',
      'siv blazedd',
      'siv10',
      'zoomstah!',
    ]) {
      expect(findPackPromo(invalid)).toBeUndefined();
    }
  });

  it('calculates exact minor-unit discounts for all catalog quality packs', () => {
    const promo = findPackPromo('siv');
    expect(promo).toBeDefined();

    const standard = packById('max-quality-standard')!;
    const standardPricing = applyPackPromo(standard.priceMinor, promo);
    expect(standardPricing).toEqual({
      originalMinor: 7400,
      discountMinor: 740,
      finalMinor: 6660,
      promo,
    });
    expect(formatPackMoney(standardPricing.finalMinor, standard.currency)).toBe(
      '£66.60',
    );

    const premium = packById('max-quality-premium')!;
    const premiumPricing = applyPackPromo(premium.priceMinor, promo);
    expect(premiumPricing).toEqual({
      originalMinor: 11500,
      discountMinor: 1150,
      finalMinor: 10350,
      promo,
    });
    expect(formatPackMoney(premiumPricing.finalMinor, premium.currency)).toBe(
      '£103.50',
    );

    const jago = packById('jago-full-quality-lifetime')!;
    const jagoPricing = applyPackPromo(jago.priceMinor, promo);
    expect(jagoPricing).toEqual({
      originalMinor: 50000,
      discountMinor: 5000,
      finalMinor: 45000,
      promo,
    });
    expect(formatPackMoney(jagoPricing.finalMinor, jago.currency)).toBe(
      '£450.00',
    );

    expect(applyPackPromo(standard.priceMinor)).toEqual({
      originalMinor: 7400,
      discountMinor: 0,
      finalMinor: 7400,
    });
  });

  it('verifies discounted Stripe payments against the stored discounted order amount', () => {
    vi.stubEnv('PACKS_STRIPE_SECRET_KEY', 'sk_test_fixture');
    const order = {
      id: '4a32d8ca-93e2-4f48-83d9-64e8a1b73a14',
      stripe_checkout_id: 'cs_test_promo123',
      price_minor: 6660,
      currency: 'GBP',
    } as PackOrder;
    const paid = {
      id: order.stripe_checkout_id,
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      livemode: false,
      client_reference_id: order.id,
      amount_total: 6660,
      currency: 'gbp',
      payment_intent: 'pi_promo123',
      metadata: {
        application: 'forged-packs',
        order_id: order.id,
        promo_code: 'popeyez',
      },
      customer_details: { email: 'buyer@example.com' },
    };

    expect(verifyStripePayment(order, paid)).toEqual({
      captureId: 'pi_promo123',
      email: 'buyer@example.com',
    });
    expect(() =>
      verifyStripePayment(order, { ...paid, amount_total: 6659 }),
    ).toThrow();
    expect(() =>
      verifyStripePayment(order, { ...paid, amount_total: 7400 }),
    ).toThrow();
  });

  it('validates promo codes through POST /api/packs/promo', async () => {
    vi.stubEnv('PACKS_DATABASE_URL', '');

    for (const code of ['siv', 'BLAZEDD', ' Zoomstah ', 'popeyez']) {
      const response = await promoPost(
        promoRequest({
          productId: 'max-quality-standard',
          promoCode: code,
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        code: code.trim().toLowerCase(),
        percentOff: 10,
        currency: 'GBP',
        originalMinor: 7400,
        discountMinor: 740,
        finalMinor: 6660,
        originalFormatted: '£74.00',
        discountFormatted: '£7.40',
        finalFormatted: '£66.60',
      });
    }

    const premiumResponse = await promoPost(
      promoRequest({
        productId: 'max-quality-premium',
        promoCode: 'popeyez',
      }),
    );
    expect(premiumResponse.status).toBe(200);
    expect(await premiumResponse.json()).toMatchObject({
      code: 'popeyez',
      percentOff: 10,
      originalMinor: 11500,
      discountMinor: 1150,
      finalMinor: 10350,
      originalFormatted: '£115.00',
      discountFormatted: '£11.50',
      finalFormatted: '£103.50',
    });

    const invalidPromo = await promoPost(
      promoRequest({
        productId: 'max-quality-standard',
        promoCode: 'notacode',
      }),
    );
    expect(invalidPromo.status).toBe(400);

    const privateTestPromo = await promoPost(
      promoRequest({
        productId: 'owner-quality-test',
        promoCode: 'siv',
      }),
    );
    expect(privateTestPromo.status).toBe(404);

    const unavailablePack = await promoPost(
      promoRequest({
        productId: 'jago-full-quality-lifetime',
        promoCode: 'siv',
      }),
    );
    expect(unavailablePack.status).toBe(404);

    const qualityMaxVidResponse = await promoPost(
      promoRequest({
        productId: 'quality-max-your-vid',
        promoCode: 'siv',
      }),
    );
    expect(qualityMaxVidResponse.status).toBe(200);
    expect(await qualityMaxVidResponse.json()).toMatchObject({
      code: 'siv',
      percentOff: 10,
      originalMinor: 3000,
      discountMinor: 300,
      finalMinor: 2700,
      originalFormatted: '£30.00',
      discountFormatted: '£3.00',
      finalFormatted: '£27.00',
    });
  });

  it('lists We Quality Max Your Vid (£30) as an available service and sends service receipts', async () => {
    const service = packById('quality-max-your-vid');
    expect(service).toMatchObject({
      name: 'We Quality Max Your Vid',
      priceMinor: 3000,
      currency: 'GBP',
      fulfilment: 'service',
      images: [{ src: '/packs/forge-quality.png', alt: expect.any(String) }],
    });
    expect(packAvailable(service!)).toBe(true);
    expect(packAvailable(packById('jago-full-quality-lifetime')!)).toBe(false);
    expect(storefrontPacks().map((p) => p.id)).toContain(
      'quality-max-your-vid',
    );

    vi.stubEnv('PACKS_APP_URL', 'https://www.forgequality.co.uk');
    vi.stubEnv('PACKS_RESEND_API_KEY', 're_test_key');
    vi.stubEnv('PACKS_RECEIPT_FROM', 'orders@forgequality.co.uk');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await sendReceipt(
        {
          id: '4a32d8ca-93e2-4f48-83d9-64e8a1b73a14',
          paypal_order_id: '',
          capture_id: 'pi_service123',
          product_id: 'quality-max-your-vid',
          product_name: 'We Quality Max Your Vid',
          file_key: '',
          download_name: '',
          price_minor: 2700,
          currency: 'GBP',
          buyer_email: 'buyer@example.com',
          status: 'paid',
          paid_at: new Date(),
          expires_at: new Date(),
          receipt_sent_at: null,
        },
        'receipt-key-1',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(payload.subject).toBe('Your Forge Quality order receipt');
      expect(payload.text).toContain('We Quality Max Your Vid');
      expect(payload.text).toContain('£27.00');
      expect(payload.text).toContain('jagofq@gmail.com');
      expect(payload.text).not.toContain('/packs/download#');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
