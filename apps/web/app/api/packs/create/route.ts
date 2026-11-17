import { z } from 'zod';
import { AppError } from '@tikquick/shared';
import { packById } from '../../../../lib/packs/catalog';
import {
  checkoutEnabled,
  packsStripe,
  sessionIdSchema,
} from '../../../../lib/packs/stripe';
import { orderIdSchema, orderToken } from '../../../../lib/packs/security';
import { consentVersion } from '../../../../lib/packs/legal';
import {
  packsPost,
  packRateLimit,
  readPackJson,
} from '../../../../lib/packs/http';
import { signingSecret } from '../../../../lib/packs/delivery';
import { packDb, type PackOrder } from '../../../../lib/packs/store';
import {
  ownerTestProduct,
  ownerTestEmail,
  requirePackTestOwner,
} from '../../../../lib/packs/owner-test';

export const POST = packsPost(async (request) => {
  if (!checkoutEnabled())
    throw new AppError(
      'CLOSED',
      'Pack checkout is currently unavailable.',
      503,
    );
  const { productId } = z
    .strictObject({
      productId: z.string().min(1).max(80),
      immediateDelivery: z.literal(true),
    })
    .parse(await readPackJson(request, 2048));
  const privateTest = productId === ownerTestProduct;
  if (privateTest) await requirePackTestOwner(request);
  const standard = privateTest ? packById('max-quality-standard') : undefined;
  const pack =
    privateTest && standard
      ? {
          ...standard,
          id: ownerTestProduct,
          priceMinor: 100,
          packageLabel: 'Private account test',
        }
      : packById(productId);
  if (
    !pack ||
    !Number.isSafeInteger(pack.priceMinor) ||
    pack.priceMinor <= 0 ||
    !pack.fileKey
  )
    throw new AppError('NOT_FOUND', 'This pack is unavailable.', 404);
  const secret = signingSecret();
  await packRateLimit(request, 'create', 8);
  const id = orderIdSchema.parse(request.headers.get('Idempotency-Key'));
  const db = packDb();
  await db.query(
    `insert into forge_packs.orders
     (id,product_id,product_name,file_key,download_name,price_minor,currency,consent_version,buyer_email)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do nothing`,
    [
      id,
      pack.id,
      [pack.name, pack.packageLabel].filter(Boolean).join(' — '),
      pack.fileKey,
      pack.downloadName,
      pack.priceMinor,
      pack.currency,
      consentVersion,
      privateTest ? ownerTestEmail : null,
    ],
  );
  const stored = (
    await db.query<PackOrder>(
      "select * from forge_packs.orders where id=$1 and product_id=$2 and status='pending' and created_at > now()-interval '30 minutes'",
      [id, pack.id],
    )
  ).rows[0];
  if (!stored)
    throw new AppError(
      'CHECKOUT_EXPIRED',
      'This checkout has expired. Refresh the page and try again.',
      409,
    );
  const checkoutToken = orderToken(secret, 'capture', id);
  if (stored.paypal_order_id)
    throw new AppError(
      'CHECKOUT_EXPIRED',
      'Refresh the page to start a Stripe checkout.',
      409,
    );
  if (stored.stripe_checkout_id) {
    const previous = z
      .object({ url: z.url().nullable() })
      .parse(
        await packsStripe(`checkout/sessions/${stored.stripe_checkout_id}`),
      );
    if (!previous.url)
      throw new AppError(
        'CHECKOUT_EXPIRED',
        'Refresh the page to start a new checkout.',
        409,
      );
    return { url: previous.url };
  }
  const origin = new URL(process.env.PACKS_APP_URL!);
  const success = new URL('/packs/complete', origin);
  success.hash = `${id}.${checkoutToken}`;
  const session = z.object({ id: sessionIdSchema, url: z.url() }).parse(
    await packsStripe(
      'checkout/sessions',
      {
        mode: 'payment',
        ...(privateTest ? { customer_email: ownerTestEmail } : {}),
        'payment_method_types[0]': 'card',
        client_reference_id: id,
        'metadata[application]': 'forged-packs',
        'metadata[order_id]': id,
        'payment_intent_data[metadata][application]': 'forged-packs',
        'payment_intent_data[metadata][order_id]': id,
        'line_items[0][price_data][currency]': stored.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(stored.price_minor),
        'line_items[0][price_data][product_data][name]': stored.product_name,
        'line_items[0][quantity]': '1',
        success_url: success.href,
        cancel_url: new URL(`/packs/${pack.slug}`, origin).href,
      },
      `forge-packs-${id}`,
    ),
  );
  const saved = await db.query(
    `update forge_packs.orders set stripe_checkout_id=$2 where id=$1
     and paypal_order_id is null and (stripe_checkout_id is null or stripe_checkout_id=$2) returning id`,
    [id, session.id],
  );
  if (!saved.rowCount) throw new Error('Conflicting Stripe checkout');
  return { url: session.url };
});
