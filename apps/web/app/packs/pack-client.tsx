'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { deliveryConsent, serviceConsent } from '../../lib/packs/legal';
import styles from './packs.module.css';
import { authClient } from '../../lib/client';

async function postPack<T>(
  action: string,
  body: unknown,
  requestId?: string,
): Promise<T> {
  const session = await authClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  const response = await fetch(`/api/packs/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestId ? { 'Idempotency-Key': requestId } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

type AppliedPromo = {
  code: string;
  percentOff: number;
  originalFormatted: string;
  discountFormatted: string;
  finalFormatted: string;
};

export function PackCheckout({
  productId,
  label = 'Pay securely with Stripe',
  allowPromo = true,
  fulfilment = 'download',
}: {
  productId: string;
  label?: string;
  allowPromo?: boolean;
  fulfilment?: 'download' | 'service';
}) {
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const attemptId = useRef('');

  async function applyPromo() {
    const code = promoInput.trim();
    if (!allowPromo || promoBusy || busy) return;
    if (!code) {
      setPromoError('Enter a discount code to apply.');
      return;
    }
    setPromoBusy(true);
    setPromoError('');
    setMessage('');
    try {
      const result = await postPack<AppliedPromo>('promo', {
        productId,
        promoCode: code,
      });
      attemptId.current = '';
      setAppliedPromo(result);
      setPromoInput('');
    } catch (error) {
      setPromoError(
        error instanceof Error
          ? error.message
          : 'That discount code is not valid.',
      );
    } finally {
      setPromoBusy(false);
    }
  }

  function removePromo() {
    attemptId.current = '';
    setAppliedPromo(null);
    setPromoError('');
    setMessage('');
  }

  async function checkout() {
    if (!consented || busy || promoBusy) return;
    setBusy(true);
    setMessage('');
    setPromoError('');
    try {
      const pendingCode = allowPromo
        ? (appliedPromo?.code ?? promoInput.trim())
        : '';
      attemptId.current ||= crypto.randomUUID();
      const { url } = await postPack<{ url: string }>(
        'create',
        {
          productId,
          immediateDelivery: true,
          ...(pendingCode ? { promoCode: pendingCode } : {}),
        },
        attemptId.current,
      );
      window.location.assign(url);
    } catch (error) {
      attemptId.current = '';
      setMessage(
        error instanceof Error ? error.message : 'Could not start checkout.',
      );
      setBusy(false);
    }
  }

  const buttonLabel =
    appliedPromo && label === 'Pay securely with Stripe'
      ? `Pay ${appliedPromo.finalFormatted} securely with Stripe`
      : label;

  return (
    <div className={styles.checkout}>
      {allowPromo && (
        <section className={styles.promoSection} aria-label="Discount code">
          <label htmlFor={`promo-${productId}`} className={styles.promoLabel}>
            Discount code
          </label>
          {appliedPromo ? (
            <div className={styles.promoApplied} role="status">
              <div className={styles.promoAppliedHeader}>
                <span className={styles.promoTag}>
                  {appliedPromo.code.toUpperCase()} · {appliedPromo.percentOff}%
                  off
                </span>
                <button
                  type="button"
                  className={styles.promoRemove}
                  disabled={busy}
                  onClick={removePromo}
                >
                  Remove
                </button>
              </div>
              <dl className={styles.promoSummary}>
                <div>
                  <dt>Original price</dt>
                  <dd className={styles.promoOriginal}>
                    {appliedPromo.originalFormatted}
                  </dd>
                </div>
                <div>
                  <dt>Discount ({appliedPromo.percentOff}%)</dt>
                  <dd className={styles.promoSavings}>
                    −{appliedPromo.discountFormatted}
                  </dd>
                </div>
                <div className={styles.promoTotalRow}>
                  <dt>Total</dt>
                  <dd>{appliedPromo.finalFormatted}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className={styles.promoRow}>
              <input
                id={`promo-${productId}`}
                type="text"
                value={promoInput}
                placeholder="Enter promo code"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={40}
                disabled={busy || promoBusy}
                onChange={(event) => {
                  setPromoInput(event.target.value);
                  if (promoError) setPromoError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void applyPromo();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className={styles.promoApply}
                disabled={busy || promoBusy || !promoInput.trim()}
                onClick={() => void applyPromo()}
              >
                {promoBusy ? 'Checking…' : 'Apply'}
              </Button>
            </div>
          )}
          {promoError && (
            <p role="status" className={styles.promoError}>
              {promoError}
            </p>
          )}
        </section>
      )}
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consented}
          disabled={busy}
          onChange={(event) => setConsented(event.target.checked)}
        />
        {fulfilment === 'service' ? serviceConsent : deliveryConsent}
      </label>
      <Button disabled={!consented || busy || promoBusy} onClick={checkout}>
        {busy ? 'Opening secure checkout…' : buttonLabel}
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function PrivatePackTest() {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    const auth = authClient();
    if (!auth) return;
    let disposed = false;
    let version = 0;
    async function check() {
      const current = ++version;
      setEligible(false);
      try {
        const result = await postPack<{ eligible: boolean }>('test-access', {});
        if (!disposed && current === version) setEligible(result.eligible);
      } catch {
        if (!disposed && current === version) setEligible(false);
      }
    }
    void check();
    const { data } = auth.auth.onAuthStateChange(() => {
      void check();
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, []);
  if (!eligible) return null;
  return (
    <section className={styles.checkout} aria-label="Private account test">
      <h3>Private £1 quality pack test</h3>
      <p>
        Only available to your signed-in account. Includes the Standard quality
        pack and an email receipt. This is a real £1 payment.
      </p>
      <PackCheckout
        productId="owner-quality-test"
        label="Pay £1 and test delivery"
        allowPromo={false}
      />
    </section>
  );
}

type CaptureResult =
  | {
      mode?: 'download';
      downloadPage: string;
      receiptSent: boolean;
    }
  | {
      mode: 'service';
      orderId: string;
      productName: string;
      supportEmail: string;
      receiptSent: boolean;
    };

export function PackComplete() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Confirming your payment…');
  const [serviceOrder, setServiceOrder] = useState<{
    orderId: string;
    productName: string;
    supportEmail: string;
    receiptSent: boolean;
  } | null>(null);
  const inFlight = useRef(false);
  async function confirm() {
    if (inFlight.current) return;
    const [id, checkoutToken] = window.location.hash.slice(1).split('.');
    if (!id || !checkoutToken) {
      setMessage(
        'Open the confirmation link from your Stripe checkout, or use the link in your receipt.',
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await postPack<CaptureResult>('capture', {
        id,
        checkoutToken,
      });
      if (result.mode === 'service') {
        setServiceOrder(result);
        setMessage('');
        return;
      }
      if (!result.receiptSent) {
        try {
          sessionStorage.setItem('forge-packs-receipt-warning', id);
        } catch {}
      }
      window.location.replace(result.downloadPage);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Payment confirmation is still pending. Please try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void confirm();
  }, []);
  if (serviceOrder) {
    const mailto = `mailto:${serviceOrder.supportEmail}?subject=${encodeURIComponent(`${serviceOrder.productName} — Order ${serviceOrder.orderId}`)}&body=${encodeURIComponent(`Order reference: ${serviceOrder.orderId}\n\nClip link or attached video:\n`)}`;
    return (
      <div className={styles.checkout}>
        <p role="status">
          Payment confirmed for <strong>{serviceOrder.productName}</strong>.
        </p>
        <p>
          Order reference <code>{serviceOrder.orderId}</code>
        </p>
        <p>
          Next step: email your video clip (or a Google Drive / WeTransfer link)
          along with your order reference to{' '}
          <a href={mailto}>{serviceOrder.supportEmail}</a> and we’ll quality-max
          your video and send it back to you.
        </p>
        <Button asChild>
          <a href={mailto}>Email your clip now</a>
        </Button>
        {!serviceOrder.receiptSent && (
          <p>
            If your receipt email does not arrive,{' '}
            <Link href="/packs/resend">request a new copy here</Link>.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className={styles.checkout}>
      <p role="status">{message}</p>
      <Button onClick={confirm} disabled={busy}>
        {busy ? 'Checking…' : 'Check payment again'}
      </Button>
    </div>
  );
}

export function PackDownload() {
  const [link, setLink] = useState<{ id: string; token: string } | null>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const [id = '', token = ''] = window.location.hash.slice(1).split('.');
    setLink(id && token ? { id, token } : null);
    try {
      if (id && sessionStorage.getItem('forge-packs-receipt-warning') === id)
        setMessage(
          'Your download is ready. If the receipt does not arrive, request a new copy below.',
        );
    } catch {
      // Download links also work when the browser disables session storage.
    }
  }, []);
  async function download() {
    if (!link) return;
    setBusy(true);
    setMessage('');
    try {
      const { url } = await postPack<{ url: string }>('download', link);
      window.location.assign(url);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Download failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.checkout}>
      {link && (
        <>
          <p>
            Order reference <code>{link.id}</code>
          </p>
          <Button onClick={download} disabled={busy}>
            {busy ? 'Preparing download…' : 'Download pack'}
          </Button>
        </>
      )}
      {link === null && <p>Open the download link from your receipt.</p>}
      {message && <p role="status">{message}</p>}
      <Link href="/packs/resend">Resend my download link</Link>
    </div>
  );
}

export function PackResend() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await postPack('resend', {
        id: String(data.get('id')).trim(),
        email: String(data.get('email')).trim(),
      });
      setMessage(
        'If the order and email match a valid purchase, we’ll send the download link to that address.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.checkout} onSubmit={submit}>
      <label>
        Order reference
        <input name="id" required maxLength={36} />
      </label>
      <label>
        Checkout email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? 'Requesting…' : 'Resend download link'}
      </Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
