'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Film,
  Download,
  Trash2,
  Clock,
  Check,
  ShieldCheck,
  LoaderCircle,
  Mail,
  ArrowRight,
  Info,
} from 'lucide-react';
import { type Job, formatBytes, stages } from '@tikquick/shared';
import { api, authClient } from '../lib/client';
import { Button } from './ui/button';
type Usage = {
  submitted_jobs: number;
  completed_jobs: number;
  daily_limit: number | 'Unlimited';
  max_input_bytes: number;
  uploaded_bytes: number;
  processed_bytes: number;
  resets_at: string;
};
export function Library({ overview = false }: { overview?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [usage, setUsage] = useState<Usage>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [confirm, setConfirm] = useState<string>();
  const expanded = useRef(false);
  async function load() {
    try {
      const [data, quota] = await Promise.all([
        api<{ jobs: Job[]; next_cursor: string }>('/api/jobs'),
        api<Usage>('/api/usage'),
      ]);
      setJobs((previous) =>
        expanded.current
          ? [
              ...data.jobs,
              ...previous.filter(
                (j) =>
                  !data.jobs.some((f) => f.id === j.id) &&
                  new Date(j.created_at).getTime() <
                    new Date(data.jobs.at(-1)?.created_at || 0).getTime(),
              ),
            ]
          : data.jobs,
      );
      if (!expanded.current) setNext(data.next_cursor);
      setUsage(quota);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, []);
  async function action(job: Job, kind: string) {
    setBusy(job.id);
    try {
      if (kind === 'download') {
        const { url } = await api<{ url: string }>(
          `/api/jobs/${job.id}/download`,
        );
        window.location.assign(url);
      } else {
        await api(`/api/jobs/${job.id}`, { method: 'DELETE' });
        setConfirm(undefined);
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {overview
              ? 'A LITTLE LESS ADMIN. A LITTLE MORE CREATING.'
              : 'EVERY EXPORT, IN ONE PLACE.'}
          </div>
          <h1>
            {overview ? 'Your creative workspace' : 'Video history'}
            <span className="cyan">.</span>
          </h1>
          <p>
            {overview
              ? 'Pick up where you left off, or start something new.'
              : 'Your recent videos and their processing status.'}
          </p>
        </div>
        <Button asChild>
          <Link href="/optimize">
            New video <ArrowUpRight size={17} />
          </Link>
        </Button>
      </div>
      {overview && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span>
                <Film size={17} /> Videos today
              </span>
              <strong>
                {usage?.submitted_jobs ?? '—'}
                <small> / {usage?.daily_limit ?? '—'}</small>
              </strong>
              <p>Daily allowance resets at 00:00 UTC</p>
            </div>
            <div className="stat-card">
              <span>
                <Check size={17} /> Ready to go
              </span>
              <strong>{usage?.completed_jobs ?? '—'}</strong>
              <p>Videos completed today</p>
            </div>
            <div className="stat-card">
              <span>
                <Clock size={17} /> Private storage
              </span>
              <strong>
                24<small> hours</small>
              </strong>
              <p>Automatic deletion. Always your choice.</p>
            </div>
          </div>
          <div className="dashboard-banner">
            <div>
              <span className="eyebrow">YOUR NEXT VIDEO IS WAITING.</span>
              <h2>Give your export a strong finish.</h2>
              <p>Upload. Optimize. Get back to creating.</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/optimize">
                Open the studio <ArrowRight size={17} />
              </Link>
            </Button>
          </div>
        </>
      )}
      {error && (
        <div role="alert" className="alert">
          <Info size={17} />
          {error}
          <Link href="/login">Sign in</Link>
        </div>
      )}
      <section className="panel history-panel">
        <div className="panel-heading">
          <h2>{overview ? 'Recent videos' : 'Your videos'}</h2>
          <span className="muted">{jobs.length} videos</span>
          {overview && (
            <Link href="/history" className="text-link">
              View all <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
        {loading ? (
          <div className="empty-state">
            <LoaderCircle className="spin" />
            <p>Loading your workspace…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <span className="large-file-icon">
              <Film size={28} />
            </span>
            <h3>Your next video belongs here.</h3>
            <p>
              Upload your first export to get started.
              <br />
              We’ll keep its progress and download in one place.
            </p>
            <Button asChild>
              <Link href="/optimize">
                Optimize your first video <ArrowUpRight size={16} />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Video</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(overview ? jobs.slice(0, 5) : jobs).map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link
                        href={`/optimize?job=${job.id}`}
                        className="video-cell"
                      >
                        <span>
                          <Film size={18} />
                        </span>
                        <div>
                          {job.filename}
                          <small>
                            {formatBytes(job.input_size_bytes)} ·{' '}
                            {job.use_encoder
                              ? 'With preprocessing'
                              : 'Standard'}
                          </small>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span className={`job-badge badge-${job.status}`}>
                        <span />
                        {stages[job.status] || job.status}
                      </span>
                    </td>
                    <td className="muted">
                      {new Date(job.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td>
                      <div className="table-actions">
                        {job.status === 'completed' && (
                          <button
                            className="icon-button"
                            disabled={busy === job.id}
                            aria-label={`Download ${job.filename}`}
                            onClick={() => action(job, 'download')}
                          >
                            <Download size={17} />
                          </button>
                        )}
                        {confirm === job.id ? (
                          <>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy === job.id}
                              onClick={() => action(job, 'delete')}
                            >
                              Delete video?
                            </Button>
                            <button
                              className="icon-button"
                              onClick={() => setConfirm(undefined)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            className="icon-button"
                            aria-label={`Delete ${job.filename}`}
                            disabled={job.status === 'deleting'}
                            onClick={() => setConfirm(job.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!overview && next && (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const data = await api<{ jobs: Job[]; next_cursor: string }>(
                  `/api/jobs?before=${encodeURIComponent(next)}`,
                );
                setJobs([...jobs, ...data.jobs]);
                expanded.current = true;
                setNext(data.next_cursor);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Load older videos
          </Button>
        )}
      </section>
    </div>
  );
}
export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const auth = authClient();
      if (!auth)
        throw new Error(
          'Sign-in will be available when Supabase is configured.',
        );
      const result =
        mode === 'signup'
          ? await auth.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: window.location.origin + '/dashboard',
              },
            })
          : await auth.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) window.location.assign('/optimize');
      else
        setMessage('Check your email to confirm your account, then sign in.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page auth-page">
      <section className="panel auth-panel">
        <span className="large-file-icon">
          <ShieldCheck size={28} />
        </span>
        <div className="eyebrow">YOUR PERSONAL CREATIVE SPACE</div>
        <h1>
          {mode === 'signin'
            ? 'Welcome back.'
            : 'Make room for your next idea.'}
        </h1>
        <p>
          {mode === 'signin'
            ? 'Sign in and give your next export a strong finish.'
            : 'Create an account to securely upload and optimize videos.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={8}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Mail size={17} />
            )}{' '}
            {mode === 'signup' ? 'Create account' : 'Sign in'}
            <ArrowRight size={16} />
          </Button>
        </form>
        {message && (
          <p role="status" className="alert">
            {message}
          </p>
        )}
        <div className="auth-switch">
          {mode === 'signin' ? 'New to Forged?' : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setMessage('');
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </div>
        <div className="auth-footnote">
          <ShieldCheck size={14} /> No TikTok account connection required.
        </div>
      </section>
    </div>
  );
}
export function Settings() {
  const [email, setEmail] = useState('Not signed in');
  const [usage, setUsage] = useState<Usage>();
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void authClient()
      ?.auth.getUser()
      .then(({ data }) => setEmail(data.user?.email || 'Not signed in'));
    void api<Usage>('/api/usage')
      .then(setUsage)
      .catch(() => {});
  }, []);
  async function deleteAll() {
    setDeleting(true);
    try {
      await api('/api/account/videos', { method: 'DELETE' });
      setMessage(
        'Deletion requested. The worker will remove all of your videos and their history.',
      );
      setConfirm(false);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE, YOUR RULES.</div>
          <h1>
            Account & privacy<span className="cyan">.</span>
          </h1>
          <p>A clear view of your account and your files.</p>
        </div>
      </div>
      <section className="panel settings-section">
        <h2>Your account</h2>
        <div className="setting-row">
          <div>
            <strong>Email address</strong>
            <p>{email}</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/login">
              Manage sign-in <ArrowUpRight size={15} />
            </Link>
          </Button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Daily video allowance</strong>
            <p>
              {usage
                ? `${usage.submitted_jobs} of ${usage.daily_limit} submissions used today`
                : 'Sign in to see your allowance.'}
            </p>
          </div>
          <span className="small-tag">RESETS AT 00:00 UTC</span>
        </div>
      </section>
      <section className="panel settings-section">
        <h2>Privacy & storage</h2>
        <div className="setting-row">
          <div>
            <strong>Private by default</strong>
            <p>
              Originals and results are stored in a private bucket. Download
              links expire after 60 seconds.
            </p>
          </div>
          <ShieldCheck className="cyan" size={23} />
        </div>
        <div className="setting-row">
          <div>
            <strong>24-hour retention</strong>
            <p>
              Files and processing history are deleted automatically after 24
              hours. Aggregate daily usage remains for quota accounting.
            </p>
          </div>
          <Clock size={23} />
        </div>
        <div className="setting-row">
          <div>
            <strong>Third-party processing</strong>
            <p>
              Our processing provider receives your video for optimization.
              Forged can delete its own stored copies; the provider controls
              retention of copies on its servers.
            </p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>TikTok publishing</strong>
            <p>
              You can post a completed video using your own Zernio API key and a
              TikTok account connected in Zernio. Your key is used for this page
              session and is not saved by Forged. Posting requires your explicit
              consent. When you post, the video is copied to Zernio’s temporary
              storage, where Zernio controls retention.
            </p>
          </div>
          <span className="small-tag">OPTIONAL</span>
        </div>
      </section>
      <section className="panel settings-section danger-section">
        <h2>Delete your video data</h2>
        <p>
          This removes all uploaded videos, results, and their processing
          history. Active local processing will be cancelled. Your account
          remains available.
        </p>
        {confirm ? (
          <div className="confirm-row">
            <Button variant="danger" disabled={deleting} onClick={deleteAll}>
              {deleting
                ? 'Requesting deletion…'
                : 'Confirm deletion of all videos'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep my videos
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <Trash2 size={16} /> Delete all videos
          </Button>
        )}
        {message && (
          <p role="status" className="alert">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
