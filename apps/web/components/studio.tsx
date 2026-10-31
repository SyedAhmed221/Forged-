'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  ArrowUpRight,
  Film,
  ShieldCheck,
  SlidersHorizontal,
  Check,
  Download,
  LoaderCircle,
  X,
  ArrowRight,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  type Job,
  formatBytes,
  stages,
  MAX_INPUT_BYTES,
} from '@tikquick/shared';
import { api, authClient } from '../lib/client';
import { Button } from './ui/button';
const terminal = ['completed', 'failed', 'cancelled', 'deleting'];
export function Studio() {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [metadata, setMetadata] = useState({
    width: 0,
    height: 0,
    duration: 0,
  });
  const [encoder, setEncoder] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [id, setId] = useState<string>();
  const [maxSize, setMaxSize] = useState(MAX_INPUT_BYTES);
  const [signedIn, setSignedIn] = useState(false);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const stored = new URLSearchParams(window.location.search).get('job');
    if (stored) setId(stored);
    const auth = authClient();
    if (auth)
      void auth.auth.getSession().then(({ data }) => {
        setSignedIn(!!data.session);
        if (data.session)
          void api<{ max_input_bytes: number }>('/api/usage')
            .then((u) => setMaxSize(u.max_input_bytes))
            .catch(() => {});
      });
    return () => xhr.current?.abort();
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let done = false;
      try {
        const next = await api<Job>(`/api/jobs/${id}`);
        if (!disposed) {
          setJob(next);
          setPollError('');
          done = terminal.includes(next.status);
        }
      } catch (e) {
        if (!disposed) setPollError((e as Error).message);
      }
      if (!disposed && !done) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [id]);
  function choose(next?: File) {
    setError('');
    if (!next) return;
    if (!/\.(mp4|mov)$/i.test(next.name)) {
      setError('Choose an MP4 or MOV video.');
      return;
    }
    if (next.size > maxSize || next.size === 0) {
      setError(`Choose a video smaller than ${formatBytes(maxSize)}.`);
      return;
    }
    setMetadata({ width: 0, height: 0, duration: 0 });
    setFile(next);
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    let created: string | undefined;
    try {
      const session = await api<{ id: string; url: string }>(
        '/api/uploads/create',
        {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            use_encoder: encoder,
          }),
        },
      );
      created = session.id;
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        request.open('PUT', session.url);
        request.setRequestHeader('Content-Type', 'application/octet-stream');
        request.upload.onprogress = (e) => setUploaded(e.loaded);
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(new Error('The upload failed. Please try again.'));
        request.onerror = () =>
          reject(new Error('Connection lost during upload. Please try again.'));
        request.onabort = () => reject(new Error('Upload cancelled.'));
        request.timeout = 15 * 60 * 1000;
        request.ontimeout = () => reject(new Error('Upload timed out.'));
        request.send(file);
      });
      await api('/api/uploads/complete', {
        method: 'POST',
        body: JSON.stringify({ id: session.id }),
      });
      setId(session.id);
      window.history.replaceState(null, '', `/optimize?job=${session.id}`);
    } catch (e) {
      setError((e as Error).message);
      if (created)
        await api(`/api/jobs/${created}`, { method: 'DELETE' }).catch(() => {});
    } finally {
      setBusy(false);
      xhr.current = null;
    }
  }
  async function action(kind: string) {
    if (!id) return;
    setError('');
    try {
      if (kind === 'download') {
        const { url } = await api<{ url: string }>(`/api/jobs/${id}/download`);
        window.location.assign(url);
      } else {
        await api(`/api/jobs/${id}/${kind}`, { method: 'POST' });
        setJob(await api<Job>(`/api/jobs/${id}`));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR NEXT GREAT UPLOAD STARTS HERE</div>
          <h1>
            Optimize your video<span className="cyan">.</span>
          </h1>
          <p>The final touch between your edit and the feed.</p>
        </div>
        <span className="outlined-chip">
          <ShieldCheck size={14} /> PRIVATE WORKSPACE
        </span>
      </div>
      <div className="studio-grid">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <span className="number-square">01</span>
            <div>
              <h2>{job ? 'Your video' : 'Add your video'}</h2>
              <p>
                {job ? job.filename : 'A great edit deserves a great finish.'}
              </p>
            </div>
            <span className="small-tag">MP4 / MOV</span>
          </div>
          {!job ? (
            <>
              <input
                ref={input}
                type="file"
                accept=".mp4,.mov,video/mp4,video/quicktime"
                className="sr-only"
                id="video-file"
                onChange={(e) => choose(e.target.files?.[0])}
                disabled={busy}
              />
              {preview ? (
                <div className="video-preview">
                  <video
                    controls
                    src={preview}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      setMetadata({
                        width: v.videoWidth,
                        height: v.videoHeight,
                        duration: v.duration,
                      });
                    }}
                    onError={() =>
                      setError(
                        'Your browser cannot preview this file. The worker will validate its media tracks.',
                      )
                    }
                    aria-label="Original video preview"
                  />
                  <div className="file-row">
                    <Film size={18} />
                    <span>
                      {file?.name}
                      <small>
                        {formatBytes(file?.size || 0)}{' '}
                        {metadata.width > 0
                          ? `· ${metadata.width} × ${metadata.height} · ${metadata.duration.toFixed(1)}s`
                          : ''}
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Remove selected video"
                      disabled={busy}
                      onClick={() => {
                        setFile(undefined);
                        setError('');
                        if (input.current) input.current.value = '';
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Choose a video"
                  className={`drop-zone ${drag ? 'dragging' : ''}`}
                  onClick={() => input.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      input.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    choose(e.dataTransfer.files[0]);
                  }}
                >
                  <div className="upload-orbit">
                    <div>
                      <Upload size={29} />
                    </div>
                  </div>
                  <h3>Drop your next big thing.</h3>
                  <p>
                    Drag your video here, or <span>browse files</span>
                  </p>
                  <div className="drop-hint">
                    MP4 or MOV <span>·</span> Up to {formatBytes(maxSize)}
                  </div>
                </div>
              )}
              <div className="encoder-option">
                <span className="option-icon">
                  <SlidersHorizontal size={20} />
                </span>
                <label htmlFor="encoder">
                  <strong>
                    Re-encode before patching <span>OPTIONAL</span>
                  </strong>
                  <small>
                    Leave off to preserve quality without re-encoding. Enable
                    only if your video needs compression before patching.
                  </small>
                </label>
                <input
                  id="encoder"
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={encoder}
                  onChange={(e) => setEncoder(e.target.checked)}
                  disabled={busy}
                />
              </div>
              {busy && (
                <div className="upload-progress">
                  <div>
                    <span>Uploading to secure storage</span>
                    <strong>
                      {Math.min(
                        100,
                        Math.round((uploaded / (file?.size || 1)) * 100),
                      )}
                      %
                    </strong>
                  </div>
                  <progress value={uploaded} max={file?.size || 1} />
                  <small>
                    {formatBytes(uploaded)} of {formatBytes(file?.size || 0)}
                  </small>
                </div>
              )}
              <div className="upload-actions">
                <span>
                  <ShieldCheck size={14} /> Encrypted in transit. Private at
                  rest.
                </span>
                {signedIn ? (
                  <Button onClick={upload} disabled={!file || busy}>
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Upload size={17} />
                    )}{' '}
                    {busy ? 'Uploading…' : 'Upload video'}
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/login">
                      Sign in to upload <ArrowUpRight size={16} />
                    </Link>
                  </Button>
                )}
                {busy && (
                  <Button variant="ghost" onClick={() => xhr.current?.abort()}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="job-file">
                <span className="large-file-icon">
                  <Film size={32} />
                </span>
                <div>
                  <h3>{job.filename}</h3>
                  <p>
                    {formatBytes(job.input_size_bytes)} ·{' '}
                    {job.use_encoder
                      ? 'Preprocessing enabled'
                      : 'Standard processing'}
                  </p>
                  {job.input_metadata && (
                    <p>
                      {job.input_metadata.duration.toFixed(1)} seconds ·{' '}
                      {job.input_metadata.streams
                        .filter((s) => s.codec_type === 'video')
                        .map((s) => `${s.width} × ${s.height}`)
                        .join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="job-status">
                <div
                  className={`status-symbol ${job.status === 'completed' ? 'success' : ''}`}
                >
                  {job.status === 'completed' ? (
                    <Check />
                  ) : job.status === 'failed' ? (
                    <Info />
                  ) : (
                    <LoaderCircle
                      className={terminal.includes(job.status) ? '' : 'spin'}
                    />
                  )}
                </div>
                <h3>
                  {job.status === 'failed'
                    ? 'This video needs another try'
                    : job.status === 'cancelled'
                      ? 'Processing cancelled'
                      : stages[job.provider_stage || job.status] || job.status}
                </h3>
                {job.error_message && <p>{job.error_message}</p>}
                {job.progress.uploaded_bytes !== undefined &&
                  job.progress.total_bytes && (
                    <>
                      <progress
                        value={job.progress.uploaded_bytes}
                        max={job.progress.total_bytes}
                      />
                      <p>
                        {formatBytes(job.progress.uploaded_bytes)} of{' '}
                        {formatBytes(job.progress.total_bytes)} sent
                      </p>
                    </>
                  )}
                {job.progress.encoder_percent !== undefined && (
                  <p>Encoder rendering: {job.progress.encoder_percent}%</p>
                )}
                {job.progress.received_bytes !== undefined && (
                  <p>{formatBytes(job.progress.received_bytes)} received</p>
                )}
                {job.status === 'uploaded' && (
                  <Button onClick={() => action('start')}>
                    Start optimization <ArrowRight size={17} />
                  </Button>
                )}
                {job.status === 'completed' && (
                  <>
                    <Button onClick={() => action('download')}>
                      <Download size={17} /> Download video
                    </Button>
                    {job.output_metadata?.validation === 'tikquick_content' && (
                      <p>
                        Video content verified. Download the original TikQuick
                        patch for upload to TikTok. Its special timing samples
                        may prevent playback in ordinary video players.
                      </p>
                    )}
                  </>
                )}
                {['queued', 'processing'].includes(job.status) && (
                  <Button
                    variant="ghost"
                    onClick={() => action('cancel')}
                    disabled={job.cancel_requested}
                  >
                    {job.cancel_requested
                      ? 'Cancellation requested'
                      : 'Cancel processing'}
                  </Button>
                )}
                {terminal.includes(job.status) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setId(undefined);
                      setJob(undefined);
                      setFile(undefined);
                      setUploaded(0);
                      window.history.replaceState(null, '', '/optimize');
                    }}
                  >
                    Start another video <ArrowUpRight size={15} />
                  </Button>
                )}
              </div>
            </>
          )}
          {error && (
            <div role="alert" className="alert">
              <Info size={17} />
              {error}
            </div>
          )}
          {pollError && (
            <div role="status" className="alert">
              <RefreshCw size={16} />
              {pollError} Reconnecting…
            </div>
          )}
        </section>
        <aside className="studio-aside">
          <section className="panel workflow-panel">
            <div className="eyebrow">FROM EXPORT TO UPLOAD</div>
            <h2>
              A little prep. <br />A better starting point.
            </h2>
            <ol className="workflow-list">
              <li>
                <span>1</span>
                <div>
                  <strong>Upload securely</strong>
                  <p>Send your original straight to private storage.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Let us do the prep</strong>
                  <p>
                    TikQuick processes your video. Follow each stage right here.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Download & make it live</strong>
                  <p>Your file, ready for your next TikTok upload.</p>
                </div>
              </li>
            </ol>
            <div className="workflow-note">
              <Info size={16} />
              <p>
                No TikTok account connection required. You choose when and where
                to post.
              </p>
            </div>
          </section>
          <section className="tip-card">
            <span className="eyebrow">A NOTE FOR YOUR NEXT EXPORT</span>
            <h3>Already compressed?</h3>
            <p>
              Leave preprocessing off. Your video will go straight to the
              patching step.
            </p>
            <div className="tip-line" />
          </section>
        </aside>
      </div>
      <div className="bottom-note">
        <ShieldCheck size={15} />
        <p>
          Files are retained for 24 hours. Delete them sooner from{' '}
          <Link href="/history">your video history</Link>. Optimization does not
          guarantee platform playback quality.
        </p>
      </div>
    </div>
  );
}
