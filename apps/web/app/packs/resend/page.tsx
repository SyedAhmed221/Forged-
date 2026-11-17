import type { Metadata } from 'next';
import { PackResend } from '../pack-client';
import styles from '../packs.module.css';

export const metadata: Metadata = {
  title: 'Resend pack download link',
  robots: { index: false, follow: false },
};
export default function PackResendPage() {
  return (
    <div className={styles.empty}>
      <h1>Resend your download link</h1>
      <p>
        Enter your order reference and the email address entered at checkout.
      </p>
      <PackResend />
    </div>
  );
}
