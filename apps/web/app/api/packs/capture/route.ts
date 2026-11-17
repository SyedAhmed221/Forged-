import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import {
  packsPost,
  packRateLimit,
  readPackJson,
} from '../../../../lib/packs/http';
import { packsStripe } from '../../../../lib/packs/stripe';
import { orderIdSchema, validOrderToken } from '../../../../lib/packs/security';
import {
  downloadPage,
  sendInitialReceipt,
  signingSecret,
} from '../../../../lib/packs/delivery';
import { packDb, type PackOrder } from '../../../../lib/packs/store';
import { fulfilStripeOrder } from '../../../../lib/packs/fulfilment';

export const POST = packsPost(async (request) => {
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
  if (!stored.stripe_checkout_id)
    throw new AppError(
      'NOT_FOUND',
      'This Stripe checkout could not be found.',
      404,
    );
  let order = stored;
  if (stored.status === 'pending') {
    const session = await packsStripe(
      `checkout/sessions/${stored.stripe_checkout_id}`,
    );
    order = await fulfilStripeOrder(stored, session);
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
