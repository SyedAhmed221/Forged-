import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import { packsPost, readPackJson } from '../../../../lib/packs/http';
import { paypalRequest, verifyWebhook } from '../../../../lib/packs/paypal';
import { paypalIdSchema } from '../../../../lib/packs/security';
import {
  packDb,
  revokeCapture,
  type PackOrder,
} from '../../../../lib/packs/store';
import { sendInitialReceipt } from '../../../../lib/packs/delivery';
import { fulfilPackOrder } from '../../../../lib/packs/fulfilment';

const eventSchema = z.object({
  event_type: z.string(),
  resource: z.object({
    id: paypalIdSchema,
    links: z.array(z.object({ href: z.string(), rel: z.string() })).optional(),
    supplementary_data: z
      .object({
        related_ids: z.object({
          order_id: paypalIdSchema.optional(),
          capture_id: paypalIdSchema.optional(),
        }),
      })
      .optional(),
  }),
});

export const POST = packsPost(async (request) => {
  const event = await readPackJson(request, 128 * 1024);
  if (!(await verifyWebhook(request.headers, event)))
    throw new AppError('INVALID_WEBHOOK', 'Webhook signature is invalid.', 401);
  const { event_type: type, resource } = eventSchema.parse(event);
  const related = resource.supplementary_data?.related_ids;
  if (
    type === 'PAYMENT.CAPTURE.REFUNDED' ||
    type === 'PAYMENT.CAPTURE.REVERSED'
  ) {
    const captureLink = resource.links?.find((link) => link.rel === 'up')?.href;
    const linkedId = captureLink?.match(
      /^https:\/\/api(?:-m)?\.(?:sandbox\.)?paypal\.com\/v2\/payments\/captures\/([A-Z0-9]{6,32})\/?$/,
    )?.[1];
    const captureId =
      related?.capture_id ??
      linkedId ??
      (type === 'PAYMENT.CAPTURE.REVERSED' ? resource.id : undefined);
    if (!captureId)
      throw new AppError(
        'MISSING_CAPTURE',
        'Webhook has no capture reference.',
        422,
      );
    await revokeCapture(
      captureId,
      type === 'PAYMENT.CAPTURE.REVERSED' ? 'reversed' : 'refunded',
    );
  } else if (type === 'PAYMENT.CAPTURE.COMPLETED') {
    if (!related?.order_id)
      throw new AppError(
        'MISSING_ORDER',
        'Webhook has no order reference.',
        422,
      );
    const order = (
      await packDb().query<PackOrder>(
        'select * from forge_packs.orders where paypal_order_id=$1',
        [related.order_id],
      )
    ).rows[0];
    if (order) {
      if (order.status !== 'pending') {
        if (order.capture_id === resource.id) await sendInitialReceipt(order);
        return { received: true };
      }
      const response = await paypalRequest(
        `/v2/checkout/orders/${order.paypal_order_id}`,
      );
      if (!response.ok)
        throw new Error('Unable to verify completed PayPal order');
      const paid = await fulfilPackOrder(
        order,
        await response.json(),
        resource.id,
      );
      await sendInitialReceipt(paid);
    }
  }
  return { received: true };
});
