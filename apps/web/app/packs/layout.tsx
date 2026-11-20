import Link from 'next/link';
import type { Metadata } from 'next';
import { DISCORD_INVITE_URL } from '../../components/discord-icon';
import styles from './packs.module.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.forgequality.co.uk'),
  title: 'Forge Quality Packs',
  description:
    'Digital packs from Forge Quality. One-time purchase. No subscription.',
  openGraph: {
    title: 'Forge Quality Packs',
    description:
      'Digital packs from Forge Quality. One-time purchase. No subscription.',
    type: 'website',
  },
};

export default function PacksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className={styles.store}>
      {children}
      <footer className={styles.links}>
        <Link href="/packs/terms">Terms</Link>
        <Link href="/packs/privacy">Privacy Policy</Link>
        <Link href="/packs/refunds">Refund Policy</Link>
        <Link href="/packs/resend">Resend my download link</Link>
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
          Discord
        </a>
      </footer>
    </section>
  );
}
