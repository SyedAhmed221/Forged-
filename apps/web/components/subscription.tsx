'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/client';
import { premiumPlans } from '../../../packages/shared/src/plans';
import { Button } from './ui/button';

export function Subscription() {
  const [tier, setTier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ tier: string }>('/api/billing')
      .then((r) => setTier(r.tier))
      .catch((e) => setError(e.message));
  }, []);
  async function open(path: string, plan?: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ url: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      const url = new URL(result.url);
      if (
        url.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)
      )
        throw new Error('Invalid billing destination.');
      window.location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        {tier
          ? `Current plan: ${tier === 'premium' ? 'Premium' : 'Free'}`
          : 'Sign in to manage your subscription.'}
      </p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        disabled={busy || !tier}
        onClick={() => void open('/api/billing/portal')}
      >
        Manage billing or cancel
      </Button>
      <div className="stats-grid" style={{ marginTop: 24 }}>
        {Object.entries(premiumPlans).map(([id, plan]) => (
          <section className="stat-card" key={id}>
            <h3>{plan.label}</h3>
            <strong>£{plan.amount / 100}</strong>
            <p>
              Renews every{' '}
              {plan.months === 12
                ? 'year'
                : `${plan.months} month${plan.months === 1 ? '' : 's'}`}{' '}
              until cancelled.
            </p>
            <Button
              disabled={busy || !tier || tier === 'premium'}
              onClick={() => void open('/api/billing/checkout', id)}
            >
              Subscribe
            </Button>
          </section>
        ))}
      </div>
      <p>
        Test payments only during setup. A completed checkout must be confirmed
        before Premium access is activated.
      </p>
    </>
  );
}
