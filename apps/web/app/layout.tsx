import type { Metadata } from 'next';
import './globals.css';
import { Shell } from '../components/shell';
export const metadata: Metadata = {
  title: {
    default: 'Forged — Your video, ready for what’s next.',
    template: '%s · Forged',
  },
  description:
    'A private workspace for TikTok upload optimization. Upload, optimize, and download your next video.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
