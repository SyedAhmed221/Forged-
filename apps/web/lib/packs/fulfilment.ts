import { AppError } from '@tikquick/shared';
import { matchesPrice, paypalOrderSchema } from './paypal';
import { accessDays } from './delivery';
import { packTransaction, transitionCapture, type PackOrder } from './store';

export function verifyCapture(
  order: PackOrder,
  rawOrder: unknown,
  expectedCapture?: string,
) {
  const paypal = paypalOrderSchema.parse(rawOrder);
  const [unit] = paypal.purchase_units;
  const captures = unit.payments?.captures;
  const capture = captures?.[0];
  if (
    paypal.id !== order.paypal_order_id ||
    unit.reference_id !== order.id ||
    paypal.status !== 'COMPLETED' ||
    !capture ||
    captures.length !== 1 ||
    capture.status !== 'COMPLETED' ||
    (expectedCapture && capture.id !== expectedCapture) ||
    !matchesPrice(capture.amount, order.price_minor, order.currency)
  )
    throw new AppError(
      'PAYMENT_UNVERIFIED',
      'PayPal has not confirmed a matching completed payment. Try checking the payment again.',
      409,
    );
  const email =
    paypal.payer?.email_address ?? paypal.payment_source?.paypal?.email_address;
  if (!email)
    throw new AppError(
      'EMAIL_MISSING',
      'PayPal did not supply the receipt email. Try checking the payment again.',
      409,
    );
  return { captureId: capture.id, email };
}

export async function fulfilPackOrder(
  order: PackOrder,
  rawOrder: unknown,
  expectedCapture?: string,
) {
  const { captureId, email } = verifyCapture(order, rawOrder, expectedCapture);
  return packTransaction((db) =>
    transitionCapture(db, order, captureId, email, accessDays()),
  );
}
