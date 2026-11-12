'use client';

import { Activity, ArrowUpRight, Search } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/client';
import type { TikTokAnalytics } from '../../lib/tiktok-analytics';
import styles from './analytics.module.css';

const counts = new Intl.NumberFormat();
const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const unavailable = 'Unavailable';

export function TikTokAnalyzer() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<TikTokAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !url.trim()) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      setResult(
        await api<TikTokAnalytics>('/api/analytics', {
          method: 'POST',
          body: JSON.stringify({ url }),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not analyze this video. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel" aria-label="TikTok video analyzer">
      <div className={styles.body}>
        <form onSubmit={submit} className={styles.form} aria-busy={loading}>
          <label htmlFor="tiktok-link">Public TikTok video link</label>
          <div className={styles.controls}>
            <input
              id="tiktok-link"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={2048}
              value={url}
              disabled={loading}
              placeholder="https://www.tiktok.com/@creator/video/…"
              aria-describedby="tiktok-link-help"
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button type="submit" disabled={loading || !url.trim()}>
              <Search size={18} aria-hidden="true" />
              {loading ? 'Analyzing…' : 'Analyze video'}
            </Button>
          </div>
          <p className={styles.muted} id="tiktok-link-help">
            Use the full video address. For short share links, open the link
            first and copy the full address.
          </p>
        </form>
        {error && (
          <div className="alert" role="alert">
            {error}{' '}
            {/sign in/i.test(error) && <Link href="/login">Sign in</Link>}
          </div>
        )}
        <div role="status" aria-atomic="true" className="sr-only">
          {loading
            ? 'Analyzing TikTok video.'
            : result
              ? 'Video analysis is ready.'
              : ''}
        </div>
        {result && <VideoReport result={result} />}
        {!loading && !error && !result && (
          <div className={styles.empty}>
            <Activity size={22} aria-hidden="true" />
            <p>
              Paste a video link to see its engagement and technical details
              here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function VideoReport({ result }: { result: TikTokAnalytics }) {
  const { engagement, specs } = result;
  const engagementFields = [
    ['Views', engagement.views],
    ['Likes', engagement.likes],
    ['Comments', engagement.comments],
    ['Shares', engagement.shares],
    ['Saves', engagement.saves],
  ] as const;
  const playbackFields = [
    [
      'Resolution',
      specs.width && specs.height ? `${specs.width} × ${specs.height}` : null,
    ],
    ['Frame rate', specs.fps ? `${specs.fps} fps` : null],
    [
      'Bitrate',
      specs.bitrate ? `${(specs.bitrate / 1_000_000).toFixed(2)} Mbps` : null,
    ],
    [
      'File size',
      specs.size ? `${(specs.size / 1024 ** 2).toFixed(1)} MiB` : null,
    ],
    [
      'Codec',
      specs.codec.startsWith('h265')
        ? 'HEVC (H.265)'
        : specs.codec === 'h264'
          ? 'H.264'
          : specs.codec || null,
    ],
    [
      'Post region',
      result.region ? (regions.of(result.region) ?? result.region) : null,
    ],
  ] as const;
  return (
    <article className={styles.report} aria-label="Video analysis">
      <header className={styles.post}>
        <div>
          <h2>{result.name || `@${result.handle}`}</h2>
          <p className={styles.muted}>@{result.handle}</p>
          <div className={styles.postMeta}>
            <span className={styles.publicBadge}>Public post</span>
            {result.duration !== null && (
              <span>
                {Math.floor(result.duration / 60)}:
                {String(result.duration % 60).padStart(2, '0')}
              </span>
            )}
            {result.published !== null && (
              <time dateTime={new Date(result.published * 1000).toISOString()}>
                {dateTime.format(result.published * 1000)}
              </time>
            )}
          </div>
        </div>
        <Button asChild variant="secondary">
          <a href={result.url} target="_blank" rel="noreferrer">
            View on TikTok <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </Button>
      </header>
      {(result.caption ||
        result.hashtags.length > 0 ||
        result.categories.length > 0) && (
        <div className={styles.caption}>
          {result.caption && <p>{result.caption}</p>}
          {result.hashtags.length > 0 && (
            <ul className={styles.tags} aria-label="Hashtags">
              {[...new Set(result.hashtags)].map((tag) => (
                <li key={tag}>#{tag}</li>
              ))}
            </ul>
          )}
          {result.categories.length > 0 && (
            <ul className={styles.tags} aria-label="Categories">
              {[...new Set(result.categories)].map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section className={styles.group} aria-label="Engagement">
        <h3>Engagement</h3>
        <dl className={styles.engagement}>
          {engagementFields.map(([label, value]) => (
            <div className={styles.stat} key={label}>
              <dt>{label}</dt>
              <dd>{value === null ? unavailable : counts.format(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.group} aria-label="Playback and post details">
        <h3>Playback &amp; post details</h3>
        <p className={styles.muted}>
          Quality reflects the highest-resolution playback stream TikTok
          reported for this request.
          {(!specs.fps || !specs.bitrate || !specs.size) &&
            ' TikTok only reports some playback details for this stream.'}
        </p>
        <dl className={styles.specs}>
          {playbackFields.map(([label, value]) => (
            <div className={styles.stat} key={label}>
              <dt>{label}</dt>
              <dd>{value ?? unavailable}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
