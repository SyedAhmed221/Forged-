'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Download,
  LoaderCircle,
  Package,
  Percent,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { authClient } from '../../lib/client';
import {
  buildPackOrdersCsv,
  buildUsersCsv,
  type AdminOverviewPayload,
  type AdminPackOrderRecord,
  type AdminUserRecord,
} from '../../lib/admin-csv';
import { Button } from '../../components/ui/button';
import styles from './admin.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'not_found' }
  | { status: 'setup'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AdminOverviewPayload };

function formatDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(amountMinor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function billingStatusLabel(record: AdminUserRecord) {
  if (record.accessSource === 'test') return 'test access';
  return record.billingStatus || 'free';
}

function effectiveAccessUntil(record: AdminUserRecord) {
  if (record.accessSource === 'test') return record.testAccessUntil;
  return record.accessUntil;
}

function orderBadgeClass(status: string) {
  if (status === 'paid') return `${styles.planBadge} ${styles.planPremium}`;
  if (status === 'pending') return `${styles.planBadge} ${styles.planPending}`;
  if (status === 'refunded' || status === 'reversed')
    return `${styles.planBadge} ${styles.planRefunded}`;
  return `${styles.planBadge} ${styles.planFree}`;
}

export function AdminDashboard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'users' | 'packs'>('users');
  const [planFilter, setPlanFilter] = useState<'all' | 'premium' | 'free'>(
    'all',
  );
  const [query, setQuery] = useState('');
  const [packStatusFilter, setPackStatusFilter] = useState<
    'all' | 'paid' | 'pending' | 'refunded'
  >('all');
  const [packQuery, setPackQuery] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    const auth = authClient();
    if (!auth) {
      setState({
        status: 'error',
        message: 'Sign-in is not configured in this environment.',
      });
      return;
    }
    if (isRefresh) setRefreshing(true);
    try {
      const { data } = await auth.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setState({ status: 'unauthenticated' });
        return;
      }
      const response = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401) {
        setState({ status: 'unauthenticated' });
        return;
      }
      if (response.status === 404) {
        setState({ status: 'not_found' });
        return;
      }
      const payload = await response.json();
      if (response.status === 503) {
        setState({
          status: 'setup',
          message:
            payload.error?.message ||
            'Admin data source is not configured yet.',
        });
        return;
      }
      if (!response.ok) {
        setState({
          status: 'error',
          message:
            payload.error?.message || 'Could not load admin dashboard data.',
        });
        return;
      }
      setState({ status: 'ready', data: payload as AdminOverviewPayload });
    } catch {
      setState({
        status: 'error',
        message: 'Network error while loading admin data.',
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const auth = authClient();
    if (!auth) return;
    const { data } = auth.auth.onAuthStateChange(() => {
      void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const filteredUsers = useMemo(() => {
    if (state.status !== 'ready') return [];
    const term = query.trim().toLowerCase();
    return state.data.users.filter((record) => {
      if (planFilter !== 'all' && record.plan !== planFilter) return false;
      if (!term) return true;
      return (
        record.email.toLowerCase().includes(term) ||
        record.billingStatus.toLowerCase().includes(term) ||
        record.plan.includes(term)
      );
    });
  }, [state, planFilter, query]);

  const filteredOrders = useMemo(() => {
    if (state.status !== 'ready') return [];
    const term = packQuery.trim().toLowerCase();
    return state.data.packs.orders.filter((order: AdminPackOrderRecord) => {
      if (packStatusFilter === 'paid' && order.status !== 'paid') return false;
      if (packStatusFilter === 'pending' && order.status !== 'pending')
        return false;
      if (
        packStatusFilter === 'refunded' &&
        order.status !== 'refunded' &&
        order.status !== 'reversed'
      )
        return false;
      if (!term) return true;
      return (
        (order.buyerEmail ?? '').toLowerCase().includes(term) ||
        order.productName.toLowerCase().includes(term) ||
        order.id.toLowerCase().includes(term)
      );
    });
  }, [state, packStatusFilter, packQuery]);

  if (state.status === 'loading') {
    return (
      <div className="page">
        <div className="panel">
          <div className="empty-state">
            <LoaderCircle className="spin" />
            <p>Loading admin dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <div className="page">
        <div className="panel">
          <div className="empty-state">
            <ShieldAlert size={28} />
            <h3>Sign in required</h3>
            <p>Sign in with an authorized admin account to view this page.</p>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'not_found') {
    return (
      <div className="page">
        <div className="panel">
          <div className="empty-state">
            <h3>Page not found</h3>
            <p>The page you requested is not available for this account.</p>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to workspace</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'setup') {
    return (
      <div className="page">
        <header className="page-heading">
          <div>
            <span className="eyebrow">WORKSPACE / ADMIN</span>
            <h1>Admin setup required</h1>
          </div>
        </header>
        <section className={`panel ${styles.setupCard}`}>
          <p>{state.message}</p>
          <p>
            Option A: Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in your Vercel
            project environment variables and redeploy.
          </p>
          <p>
            Option B: Run{' '}
            <code>supabase/migrations/202611240001_admin_users_view.sql</code>{' '}
            once in the Supabase SQL Editor so the existing{' '}
            <code>forged_web</code> connection can read user tiers safely.
          </p>
        </section>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page">
        <div role="alert" className="alert">
          <ShieldAlert size={17} />
          {state.message}
          <Button variant="secondary" size="sm" onClick={() => void load(true)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { summary, packs, generatedAt } = state.data;
  const gbpRevenue = packs.summary?.revenueByCurrency.GBP ?? 0;

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE / ADMIN</span>
          <h1>
            Users &amp; billing<span className="cyan">.</span>
          </h1>
          <p>
            Live view of free and premium accounts, plus Quality Pack orders.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            variant="secondary"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          {tab === 'users' ? (
            <Button
              type="button"
              onClick={() =>
                downloadCsv(
                  `forge-users-${planFilter}-${new Date().toISOString().slice(0, 10)}.csv`,
                  buildUsersCsv(filteredUsers),
                )
              }
              disabled={filteredUsers.length === 0}
            >
              <Download size={15} />
              Export CSV ({filteredUsers.length})
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() =>
                downloadCsv(
                  `forge-pack-orders-${new Date().toISOString().slice(0, 10)}.csv`,
                  buildPackOrdersCsv(filteredOrders),
                )
              }
              disabled={filteredOrders.length === 0}
            >
              <Download size={15} />
              Export CSV ({filteredOrders.length})
            </Button>
          )}
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className="stat-card">
          <span>
            <Users size={17} /> Total users
          </span>
          <strong>{summary.totalUsers}</strong>
          <p>All registered accounts</p>
        </div>
        <div className="stat-card">
          <span>
            <Crown size={17} /> Premium users
          </span>
          <strong>{summary.premiumUsers}</strong>
          <p>
            {summary.activeSubscriptions} paid
            {summary.testAccessUsers > 0
              ? ` · ${summary.testAccessUsers} test access`
              : ' active or trialing'}
          </p>
        </div>
        <div className="stat-card">
          <span>
            <UserCheck size={17} /> Free users
          </span>
          <strong>{summary.freeUsers}</strong>
          <p>Standard free-tier accounts</p>
        </div>
        <div className="stat-card">
          <span>
            <Percent size={17} /> Conversion rate
          </span>
          <strong>{summary.conversionRate.toFixed(1)}%</strong>
          <p>Premium share of total users</p>
        </div>
      </div>

      <div className={styles.tabsBar}>
        <div className={styles.tabs} role="tablist" aria-label="Admin views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'users'}
            className={`${styles.tabButton} ${tab === 'users' ? styles.tabActive : ''}`}
            onClick={() => setTab('users')}
          >
            <Users size={15} />
            Users
            <span className={styles.tabCount}>{summary.totalUsers}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'packs'}
            className={`${styles.tabButton} ${tab === 'packs' ? styles.tabActive : ''}`}
            onClick={() => setTab('packs')}
          >
            <Package size={15} />
            Quality Packs
            <span className={styles.tabCount}>
              {packs.summary?.paidCount ?? 0}
            </span>
          </button>
        </div>
        <span className={styles.updatedAt}>
          Updated {new Date(generatedAt).toLocaleTimeString('en-GB')}
        </span>
      </div>

      {tab === 'users' ? (
        <section className="panel">
          <div className={styles.toolbar}>
            <div
              className={styles.filters}
              role="group"
              aria-label="Filter by plan"
            >
              {(
                [
                  ['all', `All (${summary.totalUsers})`],
                  ['premium', `Premium (${summary.premiumUsers})`],
                  ['free', `Free (${summary.freeUsers})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.filterPill} ${planFilter === value ? styles.filterPillActive : ''}`}
                  onClick={() => setPlanFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.searchWrap}>
              <Search size={15} className={styles.searchIcon} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by email or status…"
                aria-label="Search users by email or status"
                className={styles.searchInput}
              />
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="empty-state">
              <h3>No matching users</h3>
              <p>Try clearing your search or switching the plan filter.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Plan</th>
                    <th>Billing status</th>
                    <th>Access until</th>
                    <th>Signed up</th>
                    <th>Last sign-in</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((record) => (
                    <tr key={record.userId}>
                      <td className={styles.emailCell}>
                        {record.email || 'No email'}
                      </td>
                      <td>
                        <span
                          className={`${styles.planBadge} ${
                            record.plan === 'premium'
                              ? styles.planPremium
                              : styles.planFree
                          }`}
                        >
                          {record.plan === 'premium' ? 'Premium' : 'Free'}
                        </span>
                      </td>
                      <td className={`muted ${styles.mono}`}>
                        {billingStatusLabel(record)}
                      </td>
                      <td className={`muted ${styles.mono}`}>
                        {formatDate(effectiveAccessUntil(record))}
                      </td>
                      <td className={`muted ${styles.mono}`}>
                        {formatDate(record.signedUpAt)}
                      </td>
                      <td className={`muted ${styles.mono}`}>
                        {formatDate(record.lastSignInAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : !packs.configured ? (
        <section className={`panel ${styles.setupCard}`}>
          <h3>Quality Packs database not connected</h3>
          <p>
            Configure <code>PACKS_DATABASE_URL</code> to view Quality Pack
            orders here.
          </p>
        </section>
      ) : packs.error ? (
        <div role="alert" className="alert">
          <ShieldAlert size={17} />
          {packs.error}
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className="stat-card">
              <span>
                <Package size={17} /> Paid orders
              </span>
              <strong>{packs.summary?.paidCount ?? 0}</strong>
              <p>Completed pack purchases</p>
            </div>
            <div className="stat-card">
              <span>
                <Crown size={17} /> Gross revenue
              </span>
              <strong>{formatMoney(gbpRevenue, 'GBP')}</strong>
              <p>Paid orders (excl. £1 test)</p>
            </div>
            <div className="stat-card">
              <span>
                <Percent size={17} /> Discounted orders
              </span>
              <strong>{packs.summary?.discountedPaidCount ?? 0}</strong>
              <p>Paid with a promo code</p>
            </div>
            <div className="stat-card">
              <span>
                <ShieldAlert size={17} /> Refunded / reversed
              </span>
              <strong>{packs.summary?.refundedCount ?? 0}</strong>
              <p>{packs.summary?.pendingCount ?? 0} pending checkout</p>
            </div>
          </div>

          <section className="panel">
            <div className={styles.toolbar}>
              <div
                className={styles.filters}
                role="group"
                aria-label="Filter orders by status"
              >
                {(
                  [
                    ['all', `All (${packs.orders.length})`],
                    ['paid', 'Paid'],
                    ['pending', 'Pending'],
                    ['refunded', 'Refunded'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.filterPill} ${packStatusFilter === value ? styles.filterPillActive : ''}`}
                    onClick={() => setPackStatusFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.searchWrap}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  type="search"
                  value={packQuery}
                  onChange={(event) => setPackQuery(event.target.value)}
                  placeholder="Search by buyer email, product, or order ID…"
                  aria-label="Search pack orders"
                  className={styles.searchInput}
                />
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <h3>No matching orders</h3>
                <p>No Quality Pack orders match the current filter.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Buyer email</th>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Downloads</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td className={styles.emailCell}>
                          {order.buyerEmail || '—'}
                          {order.isPrivateTest && (
                            <span className={styles.testTag}>TEST</span>
                          )}
                        </td>
                        <td>{order.productName}</td>
                        <td className={styles.mono}>
                          {formatMoney(order.priceMinor, order.currency)}
                          {order.discountMinor > 0 && (
                            <span className={styles.discountTag}>
                              −
                              {formatMoney(order.discountMinor, order.currency)}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={orderBadgeClass(order.status)}>
                            {order.status}
                          </span>
                        </td>
                        <td className={`muted ${styles.mono}`}>
                          {order.downloadCount}
                        </td>
                        <td className={`muted ${styles.mono}`}>
                          {formatDate(order.paidAt ?? order.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
