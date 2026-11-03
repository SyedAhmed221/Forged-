'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/client';
import { premiumPlans } from '../../../packages/shared/src/plans';
import { Button } from './ui/button';
import Link from 'next/link';
import {
  Check,
  Crown,
  ArrowUpRight,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-react';

export function Subscription() {
  const [tier, setTier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accessUntil, setAccessUntil] = useState<string | null>(null);
  useEffect(() => {
    void api<{ tier: string; access_until: string | null }>('/api/billing')
      .then((r) => {
        setTier(r.tier);
        setAccessUntil(r.access_until);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
      <section
        className={`subscription-current ${tier === 'premium' ? 'is-premium' : ''}`}
        aria-busy={loading}
      >
        <span className="subscription-plan-icon">
          {loading ? (
            <LoaderCircle className="spin" size={25} />
          ) : tier === 'premium' ? (
            <Crown size={25} />
          ) : (
            <ShieldCheck size={25} />
          )}
        </span>
        <div className="subscription-current-copy">
          <span className="eyebrow">YOUR CURRENT PLAN</span>
          <h2>
            {loading
              ? 'Checking your plan…'
              : tier === 'premium'
                ? 'Premium member'
                : tier === 'free'
                  ? 'Free member'
                  : 'Your workspace, your plan'}
          </h2>
          <p>
            {tier === 'premium'
              ? 'Premium limits are active. You’re ready for your next upload.'
              : tier === 'free'
                ? 'You have 1 upload each day, with videos up to 70 MB at 1080p / 60 FPS.'
                : loading
                  ? 'Retrieving your account details.'
                  : 'Sign in to see your current plan and manage your subscription.'}
          </p>
          {tier === 'premium' && accessUntil && (
            <p className="subscription-date">
              Paid access through{' '}
              {new Date(accessUntil).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
        {tier ? (
          <span className="subscription-status">
            <span />
            {tier === 'premium' ? 'PREMIUM ACTIVE' : 'FREE PLAN'}
          </span>
        ) : (
          !loading && (
            <Button asChild variant="secondary">
              <Link href="/login">
                Sign in <ArrowUpRight size={16} />
              </Link>
            </Button>
          )
        )}
      </section>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {tier === 'premium' && (
        <div className="subscription-manage">
          <p>
            Manage your payment method, invoices and cancellation securely
            through Stripe.
          </p>
          <Button
            variant="secondary"
            disabled={busy || !tier}
            onClick={() => void open('/api/billing/portal')}
          >
            Manage billing or cancel
          </Button>
        </div>
      )}
      <div className="subscription-comparison">
        {[
          {
            id: 'free',
            name: 'Free',
            description: 'A simple start for everyday uploads.',
            features: [
              '70 MB per video',
              '1080p maximum resolution',
              '60 FPS maximum frame rate',
              '1 upload per day',
            ],
          },
          {
            id: 'premium',
            name: 'Premium',
            description: 'More room for your best work.',
            features: [
              '300 MB per video · re-encode larger files',
              '4K maximum resolution',
              '120 FPS maximum frame rate',
              'Unlimited uploads',
            ],
          },
        ].map((plan) => (
          <section
            className={`subscription-feature-card ${tier === plan.id ? 'is-current' : ''}`}
            key={plan.id}
          >
            <div className="subscription-card-title">
              <h2>{plan.name}</h2>
              {tier === plan.id && (
                <span className="subscription-current-label">
                  <Check size={13} /> Your plan
                </span>
              )}
            </div>
            <p>{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={16} />
                  {feature}
                </li>
              ))}
            </ul>
            {plan.id === 'premium' && (
              <small>Storage and processing service limits still apply.</small>
            )}
          </section>
        ))}
      </div>
      <div className="subscription-section-heading">
        <div>
          <span className="eyebrow">PREMIUM MEMBERSHIP</span>
          <h2>
            {tier === 'premium'
              ? 'Premium pricing'
              : 'Choose your billing period'}
          </h2>
        </div>
        <p>Same Premium features. Choose how often you pay.</p>
      </div>
      <div className="subscription-prices">
        {Object.entries(premiumPlans).map(([id, plan]) => (
          <section
            className={`subscription-price-card ${id === 'yearly' ? 'best-value' : ''}`}
            key={id}
          >
            {id === 'yearly' && (
              <span className="subscription-value">BEST VALUE</span>
            )}
            <h3>{plan.label}</h3>
            <div className="subscription-price">
              £{plan.amount / 100}
              <span> / {plan.label.toLowerCase()}</span>
            </div>
            <p className="subscription-monthly">
              £{(plan.amount / 100 / plan.months).toFixed(2)} per month
              equivalent
            </p>
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
              {busy
                ? 'Opening Stripe…'
                : tier === 'premium'
                  ? 'Premium active'
                  : 'Get Premium'}
              {!busy && tier !== 'premium' && <ArrowUpRight size={16} />}
            </Button>
          </section>
        ))}
      </div>
      <div className="subscription-footnote">
        <ShieldCheck size={18} />
        <p>
          Secure checkout with Stripe · All prices in GBP · Renews automatically
          until cancelled.
          <br />
          Sandbox payments are enabled during testing. No real payment is taken.
        </p>
      </div>
    </>
  );
}
