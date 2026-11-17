import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import {
  packsPost,
  packRateLimit,
  readPackJson,
} from '../../../../lib/packs/http';
import { checkoutEnabled, paypalRequest } from '../../../../lib/packs/paypal';
import { orderIdSchema, validOrderToken } from '../../../../lib/packs/security';
import {
  downloadPage,
  sendInitialReceipt,
  signingSecret,
} from '../../../../lib/packs/delivery';
import { packDb, type PackOrder } from '../../../../lib/packs/store';
import { fulfilPackOrder } from '../../../../lib/packs/fulfilment';

export const POST = packsPost(async (request) => {
  if (!checkoutEnabled())
    throw new AppError(
      'CLOSED',
      'Pack checkout is currently unavailable.',
      503,
    );
  const { id, checkoutToken } = z
    .strictObject({ id: orderIdSchema, checkoutToken: z.string().max(60) })
    .parse(await readPackJson(request, 2048));
  await packRateLimit(request, 'capture', 20);
  if (!validOrderToken(signingSecret(), 'capture', id, checkoutToken))
    throw new AppError('NOT_FOUND', 'This checkout could not be found.', 404);
  const stored = (
    await packDb().query<PackOrder>(
      'select * from forge_packs.orders where id=$1',
      [id],
    )
  ).rows[0];
  if (!stored)
    throw new AppError('NOT_FOUND', 'This checkout could not be found.', 404);
  const path = `/v2/checkout/orders/${stored.paypal_order_id}`;
  let order = stored;
  if (stored.status === 'pending') {
    const capture = await paypalRequest(path + '/capture', {}, id);
    if (capture.status === 422) {
      const previous = await paypalRequest(path);
      if (!previous.ok)
        throw new AppError(
          'CAPTURE_FAILED',
          'PayPal could not confirm your payment. Try again.',
          502,
        );
      order = await fulfilPackOrder(stored, await previous.json());
    } else if (capture.ok) {
      order = await fulfilPackOrder(stored, await capture.json());
    } else {
      throw new AppError(
        'CAPTURE_FAILED',
        'PayPal could not confirm your payment. Try again.',
        502,
      );
    }
  }
  if (order.status !== 'paid')
    throw new AppError(
      'REVOKED',
      'This order no longer has download access.',
      409,
    );
  const receiptSent = await sendInitialReceipt(order).catch(() => false);
  return { downloadPage: downloadPage(id), receiptSent };
});
