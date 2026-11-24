import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminEmails,
  buildPackOrdersCsv,
  buildUsersCsv,
  computeUserPlan,
  formatCsvCell,
  isAdminIdentity,
  summarizeUsers,
  type RawUserBillingRow,
} from '../apps/web/lib/admin';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Admin access allowlist', () => {
  it('parses comma-separated ADMIN_EMAILS case-insensitively and deduplicates', () => {
    vi.stubEnv(
      'ADMIN_EMAILS',
      ' Client@ForgeQuality.co.uk , owner@example.com, client@forgequality.co.uk , ',
    );
    expect(adminEmails()).toEqual([
      'client@forgequality.co.uk',
      'owner@example.com',
    ]);
  });

  it('requires both an allowlisted email and a confirmed email address', () => {
    vi.stubEnv('ADMIN_EMAILS', 'client@forgequality.co.uk');
    expect(
      isAdminIdentity({
        id: 'u1',
        email: 'Client@ForgeQuality.co.uk',
        email_confirmed_at: '2026-11-01T00:00:00Z',
      }),
    ).toBe(true);
    expect(
      isAdminIdentity({
        id: 'u2',
        email: 'client@forgequality.co.uk',
      }),
    ).toBe(false);
    expect(
      isAdminIdentity({
        id: 'u3',
        email: 'random@example.com',
        email_confirmed_at: '2026-11-01T00:00:00Z',
      }),
    ).toBe(false);
    vi.stubEnv('ADMIN_EMAILS', '');
    expect(
      isAdminIdentity({
        id: 'u1',
        email: 'client@forgequality.co.uk',
        email_confirmed_at: '2026-11-01T00:00:00Z',
      }),
    ).toBe(false);
  });
});

describe('Admin user tier classification', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const base: RawUserBillingRow = {
    userId: 'u-base',
    email: 'user@example.com',
    signedUpAt: '2026-11-01T10:00:00Z',
    lastSignInAt: '2026-11-20T10:00:00Z',
    billingStatus: 'free',
    accessUntil: null,
    testAccessUntil: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };

  it('matches billing.ts entitlement rules for active, trialing, expired, canceled, and test access', () => {
    expect(
      computeUserPlan(
        {
          ...base,
          billingStatus: 'active',
          accessUntil: '2026-12-01T00:00:00Z',
        },
        now,
      ),
    ).toMatchObject({ plan: 'premium', accessSource: 'subscription' });

    expect(
      computeUserPlan(
        {
          ...base,
          billingStatus: 'trialing',
          accessUntil: '2026-11-25T00:00:00Z',
        },
        now,
      ),
    ).toMatchObject({ plan: 'premium', accessSource: 'subscription' });

    expect(
      computeUserPlan(
        {
          ...base,
          billingStatus: 'active',
          accessUntil: '2026-11-20T00:00:00Z',
        },
        now,
      ),
    ).toMatchObject({ plan: 'free', accessSource: 'none' });

    expect(
      computeUserPlan(
        {
          ...base,
          billingStatus: 'canceled',
          accessUntil: '2026-12-01T00:00:00Z',
        },
        now,
      ),
    ).toMatchObject({ plan: 'free', accessSource: 'none' });

    expect(
      computeUserPlan(
        {
          ...base,
          billingStatus: 'free',
          testAccessUntil: '2026-12-01T00:00:00Z',
        },
        now,
      ),
    ).toMatchObject({ plan: 'premium', accessSource: 'test' });
  });

  it('computes accurate summary counts and conversion rate', () => {
    const records = [
      computeUserPlan(
        {
          ...base,
          userId: '1',
          billingStatus: 'active',
          accessUntil: '2026-12-01T00:00:00Z',
        },
        now,
      ),
      computeUserPlan(
        {
          ...base,
          userId: '2',
          billingStatus: 'free',
          testAccessUntil: '2026-12-01T00:00:00Z',
        },
        now,
      ),
      computeUserPlan({ ...base, userId: '3' }, now),
      computeUserPlan({ ...base, userId: '4' }, now),
    ];
    expect(summarizeUsers(records)).toEqual({
      totalUsers: 4,
      premiumUsers: 2,
      freeUsers: 2,
      conversionRate: 50,
      activeSubscriptions: 1,
      testAccessUsers: 1,
    });
  });
});

describe('Admin CSV export safety', () => {
  it('escapes commas/quotes and neutralizes spreadsheet formula prefixes', () => {
    expect(formatCsvCell('plain@example.com')).toBe('plain@example.com');
    expect(formatCsvCell('=HYPERLINK("http://evil")')).toBe(
      `"'=HYPERLINK(""http://evil"")"`,
    );
    expect(formatCsvCell('+cmd')).toBe("'+cmd");
    expect(formatCsvCell('a, b')).toBe('"a, b"');

    const usersCsv = buildUsersCsv([
      {
        userId: '1',
        email: 'buyer@example.com',
        signedUpAt: '2026-11-01T00:00:00Z',
        lastSignInAt: null,
        billingStatus: 'active',
        accessUntil: '2026-12-01T00:00:00Z',
        testAccessUntil: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        plan: 'premium',
        accessSource: 'subscription',
      },
    ]);
    expect(usersCsv.split('\r\n')).toHaveLength(2);
    expect(usersCsv).toContain(
      'buyer@example.com,premium,active,subscription,2026-12-01T00:00:00Z,,2026-11-01T00:00:00Z,',
    );

    const packsCsv = buildPackOrdersCsv([
      {
        id: 'order-1',
        productId: 'max-quality-standard',
        productName: 'TikTok DLSS Quality Method — Standard',
        buyerEmail: 'buyer@example.com',
        status: 'paid',
        currency: 'GBP',
        priceMinor: 6660,
        catalogPriceMinor: 7400,
        discountMinor: 740,
        downloadCount: 2,
        createdAt: '2026-11-20T12:00:00Z',
        paidAt: '2026-11-20T12:01:00Z',
        stripeCheckoutId: 'cs_test_123',
        isPrivateTest: false,
      },
    ]);
    expect(packsCsv).toContain('66.60,7.40,2');
  });
});
