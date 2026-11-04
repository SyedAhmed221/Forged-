import { AppError } from '@tikquick/shared';
import { transaction } from './server';
import {
  limitsFor,
  premiumPlans,
  type PremiumPlan,
} from '../../../packages/shared/src/plans';

export async function stripe(
  path: string,
  fields?: Record<string, string>,
  idempotency?: string,
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key))
    throw new AppError(
      'BILLING_UNAVAILABLE',
      'Billing is not configured.',
      503,
    );
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      ...(fields
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : {}),
      ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
    },
    body: fields ? new URLSearchParams(fields) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new AppError(
      'BILLING_UNAVAILABLE',
      'Billing is temporarily unavailable. Please try again.',
      503,
    );
  return response.json();
}
export function liveBilling() {
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') === true;
}

export async function entitlement(userId: string) {
  return transaction(userId, async (db) => {
    const result = await db.query(
      'select status, access_until, test_access_until from billing_accounts where user_id=$1',
      [userId],
    );
    const row = result.rows[0];
    const premium =
      !!row &&
      ((['active', 'trialing'].includes(row.status) &&
        new Date(row.access_until).getTime() > Date.now()) ||
        new Date(row.test_access_until).getTime() > Date.now());
    return {
      ...limitsFor(premium),
      status: row?.status || 'free',
      access_until: row?.access_until || null,
    };
  });
}

export async function checkout(request: Request, userId: string) {
  const body = await request.json();
  if (!Object.hasOwn(premiumPlans, body.plan))
    throw new AppError('INVALID_REQUEST', 'Choose a subscription plan.');
  const plan = body.plan as PremiumPlan;
  const price = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (!price)
    throw new AppError(
      'BILLING_UNAVAILABLE',
      'This plan is not configured yet.',
      503,
    );
  const customer = await transaction(userId, async (db) => {
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      `billing:${userId}`,
    ]);
    await db.query(
      'insert into billing_accounts(user_id) values($1) on conflict do nothing',
      [userId],
    );
    const { rows } = await db.query(
      'select stripe_customer_id,status,checkout_id from billing_accounts where user_id=$1 for update',
      [userId],
    );
    if (['active', 'trialing', 'past_due', 'unpaid'].includes(rows[0].status))
      throw new AppError(
        'ALREADY_SUBSCRIBED',
        'Manage your existing subscription instead.',
      );
    if (rows[0].checkout_id) {
      const previous = await stripe(`checkout/sessions/${rows[0].checkout_id}`);
      if (previous.status === 'open') return { url: previous.url };
      if (previous.status === 'complete')
        throw new AppError(
          'PAYMENT_PENDING',
          'Your payment is being confirmed. Please refresh shortly.',
        );
    }
    let customerId = rows[0].stripe_customer_id;
    if (!customerId) {
      const created = await stripe(
        'customers',
        { 'metadata[forged_user_id]': userId },
        `forged-customer-${userId}`,
      );
      customerId = created.id;
      await db.query(
        'update billing_accounts set stripe_customer_id=$2 where user_id=$1',
        [userId, customerId],
      );
    }
    const origin = process.env.APP_URL || 'https://forged-gamma.vercel.app';
    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      client_reference_id: userId,
      'subscription_data[metadata][forged_user_id]': userId,
      success_url: `${origin}/subscription?checkout=success`,
      cancel_url: `${origin}/subscription?checkout=cancelled`,
    });
    await db.query(
      'update billing_accounts set checkout_id=$2 where user_id=$1',
      [userId, session.id],
    );
    return { url: session.url };
  });
  return customer;
}

export async function portal(_request: Request, userId: string) {
  const id = await transaction(
    userId,
    async (db) =>
      (
        await db.query(
          'select stripe_customer_id from billing_accounts where user_id=$1',
          [userId],
        )
      ).rows[0]?.stripe_customer_id,
  );
  if (!id)
    throw new AppError('NOT_FOUND', 'No billing account exists yet.', 404);
  const session = await stripe('billing_portal/sessions', {
    customer: id,
    return_url: `${process.env.APP_URL || 'https://forged-gamma.vercel.app'}/subscription`,
  });
  return { url: session.url };
}
