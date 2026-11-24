export type RawUserBillingRow = {
  userId: string;
  email: string;
  signedUpAt: string | null;
  lastSignInAt: string | null;
  billingStatus: string;
  accessUntil: string | null;
  testAccessUntil: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type AdminUserRecord = RawUserBillingRow & {
  plan: 'premium' | 'free';
  accessSource: 'subscription' | 'test' | 'none';
};

export type AdminUsersSummary = {
  totalUsers: number;
  premiumUsers: number;
  freeUsers: number;
  conversionRate: number;
  activeSubscriptions: number;
  testAccessUsers: number;
};

export type AdminPackOrderRecord = {
  id: string;
  productId: string;
  productName: string;
  buyerEmail: string | null;
  status: string;
  currency: string;
  priceMinor: number;
  catalogPriceMinor: number | null;
  discountMinor: number;
  downloadCount: number;
  createdAt: string | null;
  paidAt: string | null;
  stripeCheckoutId: string | null;
  isPrivateTest: boolean;
};

export type AdminPacksPayload = {
  configured: boolean;
  error?: string;
  summary: {
    paidCount: number;
    pendingCount: number;
    refundedCount: number;
    discountedPaidCount: number;
    revenueByCurrency: Record<string, number>;
  } | null;
  orders: AdminPackOrderRecord[];
};

export type AdminOverviewPayload = {
  generatedAt: string;
  summary: AdminUsersSummary;
  users: AdminUserRecord[];
  packs: AdminPacksPayload;
};

export function formatCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildUsersCsv(users: AdminUserRecord[]): string {
  const header = [
    'email',
    'plan',
    'billing_status',
    'access_source',
    'access_until',
    'test_access_until',
    'signed_up_at',
    'last_sign_in_at',
  ];
  const lines = [header.join(',')];
  for (const record of users) {
    lines.push(
      [
        record.email,
        record.plan,
        record.billingStatus,
        record.accessSource,
        record.accessUntil ?? '',
        record.testAccessUntil ?? '',
        record.signedUpAt ?? '',
        record.lastSignInAt ?? '',
      ]
        .map(formatCsvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

export function buildPackOrdersCsv(orders: AdminPackOrderRecord[]): string {
  const header = [
    'order_id',
    'buyer_email',
    'product_name',
    'status',
    'currency',
    'amount_paid',
    'discount_amount',
    'downloads',
    'paid_at',
    'created_at',
  ];
  const lines = [header.join(',')];
  for (const order of orders) {
    lines.push(
      [
        order.id,
        order.buyerEmail ?? '',
        order.productName,
        order.status,
        order.currency,
        (order.priceMinor / 100).toFixed(2),
        (order.discountMinor / 100).toFixed(2),
        order.downloadCount,
        order.paidAt ?? '',
        order.createdAt ?? '',
      ]
        .map(formatCsvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
