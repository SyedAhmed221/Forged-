import type { Metadata } from 'next';
import { TikTokAnalyzer } from './tiktok-analyzer';

export const metadata: Metadata = { title: 'TikTok analytics' };

export default function AnalyticsPage() {
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Workspace / Analytics</span>
          <h1>TikTok Analyzer</h1>
          <p>
            See engagement, post details and playback quality for a public
            TikTok video.
          </p>
        </div>
      </header>
      <TikTokAnalyzer />
    </div>
  );
}
