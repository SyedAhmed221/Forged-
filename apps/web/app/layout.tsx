import type { Metadata } from 'next';
import { Barlow, JetBrains_Mono, Michroma } from 'next/font/google';
import './globals.css';
import { Shell } from '../components/shell';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-barlow',
});

const michroma = Michroma({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-michroma',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

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
    <html
      lang="en"
      className={`${barlow.variable} ${michroma.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
