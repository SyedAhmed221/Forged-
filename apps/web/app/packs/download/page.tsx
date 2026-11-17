import type { Metadata } from 'next';
import { PackDownload } from '../pack-client';
import styles from '../packs.module.css';

export const metadata: Metadata = {
  title: 'Download your pack',
  robots: { index: false, follow: false },
};
export default function PackDownloadPage() {
  return (
    <div className={styles.empty}>
      <h1>Download your pack</h1>
      <PackDownload />
    </div>
  );
}
