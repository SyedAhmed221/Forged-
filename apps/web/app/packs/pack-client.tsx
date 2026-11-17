'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { deliveryConsent } from '../../lib/packs/legal';
import styles from './packs.module.css';

async function postPack<T>(
  action: string,
  body: unknown,
  requestId?: string,
): Promise<T> {
  const response = await fetch(`/api/packs/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(requestId ? { 'Idempotency-Key': requestId } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export function PackCheckout({ productId }: { productId: string }) {
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const attemptId = useRef('');
  async function checkout() {
    if (!consented || busy) return;
    setBusy(true);
    setMessage('');
    try {
      attemptId.current ||= crypto.randomUUID();
      const { url } = await postPack<{ url: string }>(
        'create',
        { productId, immediateDelivery: true },
        attemptId.current,
      );
      window.location.assign(url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not start checkout.',
      );
      setBusy(false);
    }
  }
  return (
    <div className={styles.checkout}>
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consented}
          disabled={busy}
          onChange={(event) => setConsented(event.target.checked)}
        />
        {deliveryConsent}
      </label>
      <Button disabled={!consented || busy} onClick={checkout}>
        {busy ? 'Opening secure checkout�' : 'Pay securely with Stripe'}
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function PackComplete() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Confirming your payment�');
  const inFlight = useRef(false);
  async function confirm() {
    if (inFlight.current) return;
    const [id, checkoutToken] = window.location.hash.slice(1).split('.');
    if (!id || !checkoutToken) {
      setMessage(
        'Open the confirmation link from your Stripe checkout, or use the download link in your receipt.',
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await postPack<{
        downloadPage: string;
        receiptSent: boolean;
      }>('capture', { id, checkoutToken });
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
  return (
    <div className={styles.checkout}>
      <p role="status">{message}</p>
      <Button onClick={confirm} disabled={busy}>
        {busy ? 'Checking�' : 'Check payment again'}
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
