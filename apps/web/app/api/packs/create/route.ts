import { z } from 'zod';
import { AppError } from '@tikquick/shared';
import { packById } from '../../../../lib/packs/catalog';
import {
  checkoutEnabled,
  decimalAmount,
  paypalRequest,
} from '../../../../lib/packs/paypal';
import {
  orderIdSchema,
  orderToken,
  paypalIdSchema,
} from '../../../../lib/packs/security';
import { consentVersion } from '../../../../lib/packs/legal';
import {
  packsPost,
  packRateLimit,
  readPackJson,
} from '../../../../lib/packs/http';
import { signingSecret } from '../../../../lib/packs/delivery';
import { packDb, type PackOrder } from '../../../../lib/packs/store';

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
  const pack = packById(productId);
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
     (id,product_id,product_name,file_key,download_name,price_minor,currency,consent_version)
     values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do nothing`,
    [
      id,
      pack.id,
      pack.name,
      pack.fileKey,
      pack.downloadName,
      pack.priceMinor,
      pack.currency,
      consentVersion,
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
    return { id, paypalId: stored.paypal_order_id, checkoutToken };
  // TODO: Review UK and cross-border VAT and replace the reviewed final price here if needed.
  const response = await paypalRequest(
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: id,
          description: stored.product_name,
          amount: {
            currency_code: stored.currency,
            value: decimalAmount(stored.price_minor),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
          },
        },
      },
    },
    id,
  );
  if (!response.ok)
    throw new AppError(
      'CREATE_FAILED',
      'PayPal could not start checkout. Please try again.',
      502,
    );
  const { id: paypalId } = z
    .object({ id: paypalIdSchema })
    .parse(await response.json());
  const saved = await db.query(
    `update forge_packs.orders set paypal_order_id=$2 where id=$1
       and (paypal_order_id is null or paypal_order_id=$2) returning id`,
    [id, paypalId],
  );
  if (!saved.rowCount) throw new Error('Conflicting PayPal order id');
  return { id, paypalId, checkoutToken };
});
