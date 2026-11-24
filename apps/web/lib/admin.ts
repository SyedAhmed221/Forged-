import { createClient } from '@supabase/supabase-js';
import { AppError } from '@tikquick/shared';
import { database, rateLimit, user } from './server';
import { packById } from './packs/catalog';
import { ownerTestProduct } from './packs/owner-test';
import { packDb } from './packs/store';
import {
  buildPackOrdersCsv,
  buildUsersCsv,
  formatCsvCell,
  type AdminPackOrderRecord,
  type AdminPacksPayload,
  type AdminUserRecord,
  type AdminUsersSummary,
  type RawUserBillingRow,
} from './admin-csv';

export {
  buildPackOrdersCsv,
  buildUsersCsv,
  formatCsvCell,
  type AdminPackOrderRecord,
  type AdminPacksPayload,
  type AdminUserRecord,
  type AdminUsersSummary,
  type RawUserBillingRow,
};

export type AdminIdentity = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
};

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const normalized = part.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen);
}

export function isAdminIdentity(identity: AdminIdentity | null | undefined) {
  if (!identity?.email || !identity.email_confirmed_at) return false;
  const allowlist = adminEmails();
  if (!allowlist.length) return false;
  return allowlist.includes(identity.email.toLowerCase());
}

export async function requireAdmin(request: Request) {
  const identity = await user(request);
  if (!isAdminIdentity(identity)) {
    throw new AppError('NOT_FOUND', 'Not found.', 404);
  }
  if (process.env.DATABASE_URL) {
    const allowed = await rateLimit(identity.id).catch(() => true);
    if (!allowed) {
      throw new AppError(
        'RATE_LIMITED',
        'Too many requests. Try again in a minute.',
        429,
      );
    }
  }
  return identity;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export function computeUserPlan(
  row: RawUserBillingRow,
  nowMs = Date.now(),
): AdminUserRecord {
  const accessUntilMs = row.accessUntil
    ? new Date(row.accessUntil).getTime()
    : 0;
  const testUntilMs = row.testAccessUntil
    ? new Date(row.testAccessUntil).getTime()
    : 0;
  const hasSubscriptionAccess =
    ['active', 'trialing'].includes(row.billingStatus) && accessUntilMs > nowMs;
  const hasTestAccess = testUntilMs > nowMs;
  const plan: 'premium' | 'free' =
    hasSubscriptionAccess || hasTestAccess ? 'premium' : 'free';
  const accessSource: 'subscription' | 'test' | 'none' = hasSubscriptionAccess
    ? 'subscription'
    : hasTestAccess
      ? 'test'
      : 'none';
  return {
    ...row,
    plan,
    accessSource,
  };
}

export function summarizeUsers(users: AdminUserRecord[]): AdminUsersSummary {
  const totalUsers = users.length;
  let premiumUsers = 0;
  let activeSubscriptions = 0;
  let testAccessUsers = 0;
  for (const record of users) {
    if (record.plan === 'premium') premiumUsers++;
    if (record.accessSource === 'subscription') activeSubscriptions++;
    if (record.accessSource === 'test') testAccessUsers++;
  }
  const freeUsers = totalUsers - premiumUsers;
  const conversionRate =
    totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 1000) / 10 : 0;
  return {
    totalUsers,
    premiumUsers,
    freeUsers,
    conversionRate,
    activeSubscriptions,
    testAccessUsers,
  };
}

async function loadUsersViaSupabaseServiceRole(): Promise<RawUserBillingRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new AppError(
      'CONFIGURATION_REQUIRED',
      'Supabase service configuration is missing.',
      503,
    );
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authUsers: {
    id: string;
    email?: string;
    created_at?: string;
    last_sign_in_at?: string;
  }[] = [];
  const perPage = 1000;
  const maxPages = 20;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Could not load users from Supabase Auth.',
        500,
      );
    }
    const batch = data?.users ?? [];
    authUsers.push(...batch);
    if (batch.length < perPage) break;
  }

  const { data: billingRows, error: billingError } = await client
    .from('billing_accounts')
    .select(
      'user_id,status,access_until,test_access_until,stripe_customer_id,stripe_subscription_id',
    );
  if (billingError) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Could not load billing accounts from Supabase.',
      500,
    );
  }

  const billingByUser = new Map<
    string,
    {
      status?: string | null;
      access_until?: string | null;
      test_access_until?: string | null;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
    }
  >();
  for (const row of billingRows ?? []) {
    if (row.user_id) billingByUser.set(row.user_id, row);
  }

  return authUsers.map((entry) => {
    const billing = billingByUser.get(entry.id);
    return {
      userId: entry.id,
      email: entry.email ?? '',
      signedUpAt: entry.created_at ?? null,
      lastSignInAt: entry.last_sign_in_at ?? null,
      billingStatus: billing?.status || 'free',
      accessUntil: billing?.access_until ?? null,
      testAccessUntil: billing?.test_access_until ?? null,
      stripeCustomerId: billing?.stripe_customer_id ?? null,
      stripeSubscriptionId: billing?.stripe_subscription_id ?? null,
    };
  });
}

async function loadUsersViaDatabaseFunction(): Promise<RawUserBillingRow[]> {
  try {
    const { rows } = await database().query<{
      user_id: string;
      email: string | null;
      signed_up_at: Date | string | null;
      last_sign_in_at: Date | string | null;
      billing_status: string | null;
      access_until: Date | string | null;
      test_access_until: Date | string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    }>('select * from public.admin_user_billing()');

    return rows.map((row) => ({
      userId: row.user_id,
      email: row.email ?? '',
      signedUpAt: toIso(row.signed_up_at),
      lastSignInAt: toIso(row.last_sign_in_at),
      billingStatus: row.billing_status || 'free',
      accessUntil: toIso(row.access_until),
      testAccessUntil: toIso(row.test_access_until),
      stripeCustomerId: row.stripe_customer_id ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
    }));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '42883' || code === '42501') {
      throw new AppError(
        'CONFIGURATION_REQUIRED',
        'Admin user directory is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel or run the 202611240001_admin_users_view.sql migration in Supabase.',
        503,
      );
    }
    throw error;
  }
}

export async function loadAdminUsers(nowMs = Date.now()) {
  let rawRows: RawUserBillingRow[];
  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    rawRows = await loadUsersViaSupabaseServiceRole();
  } else if (process.env.DATABASE_URL) {
    rawRows = await loadUsersViaDatabaseFunction();
  } else {
    throw new AppError(
      'CONFIGURATION_REQUIRED',
      'Admin user directory is not configured yet. Set SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL.',
      503,
    );
  }

  const users = rawRows
    .map((row) => computeUserPlan(row, nowMs))
    .sort((a, b) => {
      if (a.plan !== b.plan) return a.plan === 'premium' ? -1 : 1;
      const timeA = a.signedUpAt ? new Date(a.signedUpAt).getTime() : 0;
      const timeB = b.signedUpAt ? new Date(b.signedUpAt).getTime() : 0;
      return timeB - timeA;
    });

  return {
    summary: summarizeUsers(users),
    users,
  };
}

export async function loadAdminPackOrders(): Promise<AdminPacksPayload> {
  if (!process.env.PACKS_DATABASE_URL) {
    return { configured: false, summary: null, orders: [] };
  }
  try {
    const { rows } = await packDb().query<{
      id: string;
      product_id: string;
      product_name: string;
      price_minor: number;
      currency: string;
      buyer_email: string | null;
      status: string;
      created_at: Date | string | null;
      paid_at: Date | string | null;
      download_count: number;
      stripe_checkout_id: string | null;
    }>(
      `select id, product_id, product_name, price_minor, currency, buyer_email,
              status, created_at, paid_at, download_count, stripe_checkout_id
       from forge_packs.orders
       order by created_at desc
       limit 500`,
    );

    const orders: AdminPackOrderRecord[] = rows.map((row) => {
      const isPrivateTest = row.product_id === ownerTestProduct;
      const catalogPack = isPrivateTest ? undefined : packById(row.product_id);
      const catalogPriceMinor = catalogPack ? catalogPack.priceMinor : null;
      const discountMinor =
        catalogPriceMinor !== null && row.price_minor < catalogPriceMinor
          ? catalogPriceMinor - row.price_minor
          : 0;
      return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        buyerEmail: row.buyer_email,
        status: row.status,
        currency: row.currency,
        priceMinor: Number(row.price_minor),
        catalogPriceMinor,
        discountMinor,
        downloadCount: Number(row.download_count ?? 0),
        createdAt: toIso(row.created_at),
        paidAt: toIso(row.paid_at),
        stripeCheckoutId: row.stripe_checkout_id,
        isPrivateTest,
      };
    });

    let paidCount = 0;
    let pendingCount = 0;
    let refundedCount = 0;
    let discountedPaidCount = 0;
    const revenueByCurrency: Record<string, number> = {};

    for (const order of orders) {
      if (order.isPrivateTest) continue;
      if (order.status === 'paid') {
        paidCount++;
        revenueByCurrency[order.currency] =
          (revenueByCurrency[order.currency] ?? 0) + order.priceMinor;
        if (order.discountMinor > 0) discountedPaidCount++;
      } else if (order.status === 'pending') {
        pendingCount++;
      } else if (order.status === 'refunded' || order.status === 'reversed') {
        refundedCount++;
      }
    }

    return {
      configured: true,
      summary: {
        paidCount,
        pendingCount,
        refundedCount,
        discountedPaidCount,
        revenueByCurrency,
      },
      orders,
    };
  } catch {
    return {
      configured: true,
      error: 'Could not load Quality Pack orders.',
      summary: null,
      orders: [],
    };
  }
}
