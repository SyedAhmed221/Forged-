import { createHmac, timingSafeEqual } from 'node:crypto';
import { stripe, liveBilling } from '../../../../lib/billing';
import { transaction } from '../../../../lib/server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return Response.json(
      { error: 'Billing is not configured.' },
      { status: 503 },
    );
  const raw = await request.text();
  if (raw.length > 1_000_000)
    return Response.json({ error: 'Invalid event.' }, { status: 413 });
  const parts = (request.headers.get('stripe-signature') || '').split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2) || '';
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  const verified = parts
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const signature = Buffer.from(p.slice(3), 'hex');
      return (
        signature.length === expected.length &&
        timingSafeEqual(signature, expected)
      );
    });
  if (
    !verified ||
    !Number.isFinite(Number(timestamp)) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    return Response.json(
      { error: 'Invalid event signature.' },
      { status: 400 },
    );
  try {
    const event = JSON.parse(raw);
    if (event.livemode !== liveBilling())
      return Response.json(
        { error: 'Payment environment mismatch.' },
        { status: 400 },
      );
    if (
      ![
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
      ].includes(event.type)
    )
      return Response.json({ received: true });
    // Retrieve current state so delayed/replayed events cannot restore old access.
    const sub = await stripe(`subscriptions/${event.data.object.id}`);
    const userId = sub.metadata?.forged_user_id;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId))
      return Response.json({ received: true });
    await transaction(userId, async (db) => {
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `billing:${userId}`,
      ]);
      const current = await stripe(`subscriptions/${event.data.object.id}`);
      if (current.metadata?.forged_user_id !== userId)
        throw new Error('Invalid subscription owner');
      const prices = ['MONTHLY', 'QUARTERLY', 'HALFYEARLY', 'YEARLY']
        .map((p) => process.env[`STRIPE_PRICE_${p}`])
        .filter(Boolean);
      const item = current.items?.data?.find((i: { price: { id: string } }) =>
        prices.includes(i.price.id),
      );
      const until = item?.current_period_end || current.current_period_end;
      const active =
        !!item &&
        ['active', 'trialing'].includes(current.status) &&
        Number.isFinite(until);
      await db.query(
        'update billing_accounts set status=$3, stripe_subscription_id=$4, access_until=$5,checkout_id=null,updated_at=now() where user_id=$1 and stripe_customer_id=$2',
        [
          userId,
          current.customer,
          current.status,
          current.id,
          active ? new Date(until * 1000) : null,
        ],
      );
    });
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: 'Payment confirmation could not be processed.' },
      { status: 500 },
    );
  }
}
