import { AppError } from '@tikquick/shared';
import { matchesPrice, paypalOrderSchema } from './paypal';
import { accessDays } from './delivery';
import { packTransaction, transitionCapture, type PackOrder } from './store';
import { packsLive, stripeSessionSchema } from './stripe';
import { ownerTestProduct, ownerTestEmail } from './owner-test';

export function verifyStripePayment(order: PackOrder, raw: unknown) {
  const session = stripeSessionSchema.parse(raw);
  if (
    session.id !== order.stripe_checkout_id ||
    session.mode !== 'payment' ||
    session.status !== 'complete' ||
    session.payment_status !== 'paid' ||
    session.livemode !== packsLive() ||
    session.client_reference_id !== order.id ||
    session.metadata.application !== 'forged-packs' ||
    session.metadata.order_id !== order.id ||
    session.amount_total !== order.price_minor ||
    session.currency !== order.currency.toLowerCase() ||
    !session.payment_intent ||
    !session.customer_details?.email ||
    (order.product_id === ownerTestProduct &&
      session.customer_details.email.toLowerCase() !== ownerTestEmail)
  )
    throw new AppError(
      'PAYMENT_UNVERIFIED',
      'Stripe has not confirmed a matching completed payment. Check your payment again.',
      409,
    );
  return {
    captureId: session.payment_intent,
    email: session.customer_details.email,
  };
}

export async function fulfilStripeOrder(order: PackOrder, raw: unknown) {
  const { captureId, email } = verifyStripePayment(order, raw);
  return packTransaction((db) =>
    transitionCapture(db, order, captureId, email, accessDays()),
  );
}

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
