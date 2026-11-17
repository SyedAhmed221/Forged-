'use client';

import Link from 'next/link';
import Script from 'next/script';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
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

type CheckoutOrder = { id: string; paypalId: string; checkoutToken: string };
type PayPalButtons = {
  render: (target: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
};
type PayPalSdk = {
  Buttons: (options: {
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel: () => void;
    onError: () => void;
  }) => PayPalButtons;
};

export function PackCheckout({
  productId,
  currency,
  clientId,
  guestCard,
}: {
  productId: string;
  currency: string;
  clientId: string;
  guestCard: boolean;
}) {
  const [consented, setConsented] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const order = useRef<CheckoutOrder | null>(null);
  const attemptId = useRef('');
  const captureInFlight = useRef(false);

  const capture = useCallback(async () => {
    if (!order.current || captureInFlight.current) return;
    captureInFlight.current = true;
    setBusy(true);
    setMessage('Checking your PayPal payment…');
    try {
      const result = await postPack<{
        downloadPage: string;
        receiptSent: boolean;
      }>('capture', {
        id: order.current.id,
        checkoutToken: order.current.checkoutToken,
      });
      if (!result.receiptSent) {
        try {
          sessionStorage.setItem(
            'forge-packs-receipt-warning',
            order.current.id,
          );
        } catch {}
      }
      window.location.assign(result.downloadPage);
    } catch (error) {
      setCanRetry(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not confirm payment. Check your payment again.',
      );
    } finally {
      captureInFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !consented || !target.current) return;
    const sdk = (window as Window & { paypal?: PayPalSdk }).paypal;
    if (!sdk?.Buttons) return;
    const buttons = sdk.Buttons({
      createOrder: async () => {
        if (order.current) return order.current.paypalId;
        setMessage('');
        try {
          attemptId.current ||= crypto.randomUUID();
          order.current = await postPack<CheckoutOrder>(
            'create',
            { productId, immediateDelivery: true },
            attemptId.current,
          );
          return order.current.paypalId;
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not start checkout.',
          );
          throw error;
        }
      },
      onApprove: async ({ orderID }) => {
        if (order.current?.paypalId !== orderID) {
          setMessage('Could not match this PayPal payment to your order.');
          return;
        }
        await capture();
      },
      onCancel: () => {
        order.current = null;
        attemptId.current = '';
        setMessage('PayPal checkout was closed. You can try again.');
      },
      onError: () =>
        setMessage(
          (previous) =>
            previous ||
            'PayPal could not complete checkout. Try again or choose another payment method.',
        ),
    });
    let disposed = false;
    void buttons.render(target.current).catch(() => {
      if (!disposed)
        setMessage(
          'Could not load PayPal checkout. Refresh the page and try again.',
        );
    });
    return () => {
      disposed = true;
      void buttons.close().catch(() => {});
    };
  }, [capture, consented, productId, ready]);

  const params = new URLSearchParams({
    'client-id': clientId,
    currency,
    intent: 'capture',
    components: 'buttons',
    ...(guestCard ? {} : { 'disable-funding': 'card' }),
  });
  return (
    <div className={styles.checkout}>
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consented}
          disabled={busy || canRetry}
          onChange={(event) => setConsented(event.target.checked)}
        />
        {deliveryConsent}
      </label>
      {consented && (
        <Script
          src={`https://www.paypal.com/sdk/js?${params}`}
          onReady={() => setReady(true)}
          onError={() =>
            setMessage(
              'Could not load PayPal. Check your connection and try again.',
            )
          }
        />
      )}
      <div ref={target} hidden={!consented || canRetry || busy} />
      {message && <p role="status">{message}</p>}
      {canRetry && (
        <Button onClick={capture} disabled={busy}>
          Check PayPal payment
        </Button>
      )}
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
        PayPal email
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
