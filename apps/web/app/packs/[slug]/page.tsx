import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  packBySlug,
  packageOptions,
  packPrice,
} from '../../../lib/packs/catalog';
import { checkoutEnabled } from '../../../lib/packs/paypal';
import { PackCheckout } from '../pack-client';
import styles from '../packs.module.css';

const policies = {
  terms: {
    title: 'Pack Terms',
    pending:
      'Add business details, licence terms, order conditions and support contact.',
  },
  privacy: {
    title: 'Pack Privacy Policy',
    pending:
      'Review payment and receipt data, retention, providers and rights before launch.',
  },
  refunds: {
    title: 'Pack Refund Policy',
    pending:
      'Review digital delivery consent, cancellation rights and refund procedures before launch.',
  },
} as const;

function policyFor(slug: string) {
  return Object.hasOwn(policies, slug)
    ? policies[slug as keyof typeof policies]
    : undefined;
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const policy = policyFor(slug);
  const pack = packBySlug(slug);
  if (policy)
    return { title: policy.title, robots: { index: false, follow: true } };
  if (!pack) return {};
  return {
    title: [pack.name, pack.packageLabel].filter(Boolean).join(' — '),
    description: pack.description,
    openGraph: {
      title: pack.name,
      description: pack.description,
      images: pack.images.map((image) => ({ url: image.src, alt: image.alt })),
    },
  };
}

export default async function PackDetail({ params }: Props) {
  const { slug } = await params;
  const policy = policyFor(slug);
  if (policy)
    return (
      <article className={styles.empty}>
        <Link href="/packs">Back to packs</Link>
        <h1>{policy.title}</h1>
        <p>
          <strong>TODO: legal review</strong>
        </p>
        <p>{policy.pending}</p>
      </article>
    );
  const pack = packBySlug(slug);
  if (!pack) notFound();
  return (
    <>
      <Link href="/packs">Back to packs</Link>
      <header className={styles.heading}>
        <h1>{pack.name}</h1>
        <p>{pack.description}</p>
      </header>
      <div className={styles.detail}>
        <article className={styles.cardBody}>
          {pack.images.map((image) => (
            <Image
              key={image.src}
              className={styles.preview}
              src={image.src}
              alt={image.alt}
              width={760}
              height={428}
            />
          ))}
          {pack.details.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <h2>What’s included</h2>
          <ul>
            {pack.contents.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {pack.supportDetails && (
            <>
              <h2>Premium: full 1-2-1 support</h2>
              {pack.supportDetails.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </>
          )}
          <p>{pack.sizeLabel}</p>
          <h2>Licence</h2>
          <p>{pack.licence}</p>
        </article>
        <aside className={styles.card}>
          <div className={styles.cardBody}>
            {pack.family && (
              <nav className={styles.options} aria-label="Choose package">
                {packageOptions(pack).map((option) => (
                  <Link
                    key={option.id}
                    href={`/packs/${option.slug}`}
                    aria-current={option.id === pack.id ? 'page' : undefined}
                  >
                    <span>{option.packageLabel}</span>
                    <strong>{packPrice(option)}</strong>
                  </Link>
                ))}
              </nav>
            )}
            <h2>{packPrice(pack)}</h2>
            <p>One-time purchase. No subscription.</p>
            {pack.purchaseNotice && <p>{pack.purchaseNotice}</p>}
            <p>
              Your receipt and download link go to your PayPal email address.
            </p>
            {pack.fileKey && checkoutEnabled() ? (
              <PackCheckout
                productId={pack.id}
                currency={pack.currency}
                clientId={process.env.PAYPAL_CLIENT_ID!}
                guestCard={process.env.PACKS_PAYPAL_GUEST_CARD === 'true'}
              />
            ) : (
              <p>Purchase available soon.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
