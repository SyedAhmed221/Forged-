import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import { packsPost, readPackText } from '../../../../lib/packs/http';
import {
  packsLive,
  packsStripe,
  sessionIdSchema,
  verifyStripeSignature,
} from '../../../../lib/packs/stripe';
import {
  packDb,
  revokeCapture,
  type PackOrder,
} from '../../../../lib/packs/store';
import { sendInitialReceipt } from '../../../../lib/packs/delivery';
import { fulfilStripeOrder } from '../../../../lib/packs/fulfilment';

export const runtime = 'nodejs';
export const POST = packsPost(async (request) => {
  const raw = await readPackText(request, 128 * 1024);
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature')))
    throw new AppError('INVALID_WEBHOOK', 'Webhook signature is invalid.', 401);
  const event = z
    .object({
      type: z.string(),
      livemode: z.boolean(),
      data: z.object({ object: z.object({ id: z.string() }) }),
    })
    .parse(JSON.parse(raw));
  if (event.livemode !== packsLive())
    throw new AppError('INVALID_WEBHOOK', 'Payment environment mismatch.', 400);
  if (
    [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
    ].includes(event.type)
  ) {
    const id = sessionIdSchema.parse(event.data.object.id);
    const order = (
      await packDb().query<PackOrder>(
        'select * from forge_packs.orders where stripe_checkout_id=$1',
        [id],
      )
    ).rows[0];
    if (order) {
      const session = await packsStripe(`checkout/sessions/${id}`);
      // Delayed methods can complete checkout before funds clear.
      if (
        z.object({ payment_status: z.string() }).parse(session)
          .payment_status !== 'paid'
      )
        return { received: true };
      const paid = await fulfilStripeOrder(order, session);
      await sendInitialReceipt(paid);
    }
  } else if (
    ['charge.refunded', 'charge.dispute.created'].includes(event.type)
  ) {
    let chargeId = event.data.object.id;
    if (event.type === 'charge.dispute.created') {
      const dispute = z
        .object({ charge: z.string().regex(/^ch_[A-Za-z0-9]+$/) })
        .parse(
          await packsStripe(
            `disputes/${z
              .string()
              .regex(/^dp_[A-Za-z0-9]+$/)
              .parse(chargeId)}`,
          ),
        );
      chargeId = dispute.charge;
    }
    const charge = z
      .object({
        payment_intent: z
          .string()
          .regex(/^pi_[A-Za-z0-9]+$/)
          .nullable(),
        amount_refunded: z.number().int(),
        livemode: z.boolean(),
      })
      .parse(
        await packsStripe(
          `charges/${z
            .string()
            .regex(/^ch_[A-Za-z0-9]+$/)
            .parse(chargeId)}`,
        ),
      );
    if (charge.livemode !== packsLive())
      throw new Error('Charge environment mismatch');
    // Revoke on any refund, including refund notifications received before fulfilment.
    if (
      charge.payment_intent &&
      (charge.amount_refunded > 0 || event.type === 'charge.dispute.created')
    )
      await revokeCapture(
        charge.payment_intent,
        event.type === 'charge.dispute.created' ? 'reversed' : 'refunded',
      );
  }
  return { received: true };
});
