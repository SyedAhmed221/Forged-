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
  ENCODER_MAX_BYTES,
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
  const [patchMethod, setPatchMethod] = useState<'orion' | 'luna'>('orion');
  const [serverStatus, setServerStatus] = useState<{
    online: boolean;
    latency_ms?: number;
    location?: string;
    version?: string;
  }>();
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverError, setServerError] = useState('');
  const [starting, setStarting] = useState(false);
  async function checkServer() {
    setCheckingServer(true);
    setServerError('');
    setServerStatus(undefined);
    try {
      setServerStatus(
        await api('/api/processing-status', {
          signal: AbortSignal.timeout(15000),
        }),
      );
    } catch (error) {
      setServerError(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'The connection check timed out. Please try again.'
          : error instanceof Error
            ? error.message
            : 'The connection could not be checked. Please try again.',
      );
    } finally {
      setCheckingServer(false);
    }
  }
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [finalizingUpload, setFinalizingUpload] = useState(false);
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [id, setId] = useState<string>();
  const [maxSize, setMaxSize] = useState<number | null>(MAX_INPUT_BYTES);
  const [signedIn, setSignedIn] = useState(false);
  const [zernioKey, setZernioKey] = useState('');
  const [zernioAccounts, setZernioAccounts] = useState<
    { id: string; username: string }[]
  >([]);
  const [postAccount, setPostAccount] = useState('');
  const [privacyOptions, setPrivacyOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [privacy, setPrivacy] = useState('');
  const [postInteractions, setPostInteractions] = useState<
    Record<string, { enabled?: boolean }>
  >({});
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [caption, setCaption] = useState('');
  const [postConsent, setPostConsent] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [postResult, setPostResult] = useState('');
  const [publishStage, setPublishStage] = useState<
    'idle' | 'uploading' | 'submitted' | 'pending' | 'posted' | 'failed'
  >('idle');
  useEffect(() => {
    if (publishStage !== 'submitted' || !id || !zernioKey) return;
    const controller = new AbortController();
    const deadline = Date.now() + 120_000;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const { status } = await api<{
          status: 'submitted' | 'posted' | 'failed';
        }>('/api/zernio/publish', {
          method: 'PATCH',
          body: JSON.stringify({ apiKey: zernioKey, jobId: id }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (status !== 'submitted') {
          setPublishStage(status);
          setZernioKey('');
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (Date.now() >= deadline) setPublishStage('pending');
      else timer = setTimeout(check, 5000);
    }
    timer = setTimeout(check, 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, publishStage, zernioKey]);
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
          void api<{ max_input_bytes: number | null }>('/api/usage')
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
          setJob((current) =>
            current?.id === next.id &&
            current.status === 'queued' &&
            next.status === 'uploaded'
              ? current
              : next,
          );
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
    if (next.size === 0) {
      setError('Choose a video that is not empty.');
      return;
    }
    const allowedSize =
      maxSize === 300_000_000 && encoder ? ENCODER_MAX_BYTES : maxSize;
    if (allowedSize !== null && next.size > allowedSize) {
      setError(
        maxSize === 300_000_000 && !encoder
          ? 'This video exceeds 300 MB. Enable re-encoding below, then select the file again (up to 1500 MB).'
          : `Choose a video no larger than ${((allowedSize || 0) / 1_000_000).toLocaleString()} MB.`,
      );
      return;
    }
    setMetadata({ width: 0, height: 0, duration: 0 });
    setFile(next);
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setUploaded(0);
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
            patch_method: patchMethod,
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
      setUploaded(file.size);
      setFinalizingUpload(true);
      const result = await api<{ job?: Job }>('/api/uploads/complete', {
        method: 'POST',
        body: JSON.stringify({ id: session.id }),
      });
      if (result.job) setJob(result.job);
      setId(session.id);
      window.history.replaceState(null, '', `/optimize?job=${session.id}`);
    } catch (e) {
      setError((e as Error).message);
      if (created)
        await api(`/api/jobs/${created}`, { method: 'DELETE' }).catch(() => {});
    } finally {
      setFinalizingUpload(false);
      setBusy(false);
      xhr.current = null;
    }
  }
  async function action(kind: string) {
    if (!id) return;
    if (kind === 'start') setStarting(true);
    setError('');
    try {
      if (kind === 'download') {
        const { url } = await api<{ url: string }>(`/api/jobs/${id}/download`);
        window.location.assign(url);
      } else if (kind === 'start') {
        const result = await api<{ status: Job['status'] }>(
          `/api/jobs/${id}/start`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
          },
        );
        if (result.status === 'queued') {
          setJob((current) =>
            current?.id === id && current.status === 'uploaded'
              ? { ...current, status: 'queued', provider_stage: 'queued' }
              : current,
          );
        }
      } else {
        await api(`/api/jobs/${id}/${kind}`, { method: 'POST' });
        setJob(await api<Job>(`/api/jobs/${id}`));
      }
    } catch (e) {
      setError(
        kind === 'start' && (e as Error).name === 'TimeoutError'
          ? 'Starting is taking longer than expected. Check the status or try again.'
          : (e as Error).message,
      );
    } finally {
      if (kind === 'start') setStarting(false);
    }
  }
  async function connectZernio() {
    setPostBusy(true);
    setError('');
    try {
      const result = await api<{
        accounts: { id: string; username: string }[];
      }>('/api/zernio', {
        method: 'POST',
        body: JSON.stringify({ apiKey: zernioKey }),
      });
      setZernioAccounts(result.accounts);
      setPostAccount('');
      setPrivacy('');
      setPrivacyOptions([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPostBusy(false);
    }
  }
  async function selectPostAccount(accountId: string) {
    setPostAccount(accountId);
    setPrivacy('');
    if (!accountId) {
      setPrivacyOptions([]);
      setPostInteractions({});
      return;
    }
    setPostBusy(true);
    setError('');
    try {
      const info = await api<{
        privacyLevels: { value: string; label: string }[];
        interactions: Record<string, { enabled?: boolean }>;
      }>('/api/zernio', {
        method: 'POST',
        body: JSON.stringify({ apiKey: zernioKey, accountId }),
      });
      setPrivacyOptions(info.privacyLevels);
      setPostInteractions(info.interactions || {});
      setAllowComment(false);
      setAllowDuet(false);
      setAllowStitch(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPostBusy(false);
    }
  }
  async function publishToTikTok() {
    if (!id || !postAccount || !privacy || !postConsent) return;
    setPublishStage('uploading');
    setPostResult('');
    setPostBusy(true);
    setError('');
    try {
      const result = await api<{ status: 'submitted' | 'posted' | 'failed' }>(
        '/api/zernio/publish',
        {
          method: 'POST',
          body: JSON.stringify({
            apiKey: zernioKey,
            jobId: id,
            accountId: postAccount,
            caption,
            privacyLevel: privacy,
            allowComment,
            allowDuet,
            allowStitch,
            previewConfirmed: true,
            consentGiven: true,
          }),
        },
      );
      setPublishStage(result.status);
      if (result.status !== 'submitted') setZernioKey('');
      setPostConsent(false);
    } catch (e) {
      setPublishStage('failed');
      setError((e as Error).message);
    } finally {
      setPostBusy(false);
    }
  }
  async function checkPublishStatus() {
    if (!id || !zernioKey) return;
    setPostBusy(true);
    setPostResult('');
    try {
      const { status } = await api<{
        status: 'submitted' | 'posted' | 'failed';
      }>('/api/zernio/publish', {
        method: 'PATCH',
        body: JSON.stringify({ apiKey: zernioKey, jobId: id }),
      });
      setPublishStage(status);
      if (status !== 'submitted') setZernioKey('');
    } catch (error) {
      setPostResult((error as Error).message);
    } finally {
      setPostBusy(false);
    }
  }
  const optimizationActive =
    starting || job?.status === 'queued' || job?.status === 'processing';
  const completedStages =
    job?.status === 'completed'
      ? 5
      : job?.status !== 'processing'
        ? 0
        : job.provider_stage === 'verifying'
          ? 4
          : job.provider_stage === 'receiving'
            ? 3
            : job.provider_stage === 'preparing' || !job.provider_stage
              ? 1
              : 2;
  const progress = job?.progress;
  const measuredProgress =
    job?.status === 'processing' &&
    job.provider_stage === 'sending' &&
    progress?.total_bytes &&
    progress.total_bytes > 0 &&
    progress.uploaded_bytes !== undefined
      ? (progress.uploaded_bytes / progress.total_bytes) * 100
      : job?.status === 'processing' && job.provider_stage === 'encoding'
        ? progress?.encoder_percent
        : undefined;
  const percent =
    typeof measuredProgress === 'number' && Number.isFinite(measuredProgress)
      ? Math.round(Math.max(0, Math.min(100, measuredProgress)))
      : undefined;
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
                    MP4 or MOV <span>·</span>{' '}
                    {maxSize === null
                      ? 'No file-size limit'
                      : `Up to ${(maxSize / 1_000_000).toLocaleString()} MB`}
                  </div>
                </div>
              )}
              <section className="patch-options">
                <div className="processing-server-status">
                  <span>
                    {serverStatus?.location
                      ? `Server: ${serverStatus.location}`
                      : 'Processing server'}
                    {serverStatus?.version
                      ? ` · Version: ${serverStatus.version}`
                      : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checkingServer || busy}
                    onClick={() => void checkServer()}
                  >
                    {checkingServer ? 'Checking…' : 'Test connection'}
                  </Button>
                </div>
                {serverStatus && (
                  <p
                    role="status"
                    className={
                      serverStatus.online ? 'server-online' : 'server-offline'
                    }
                  >
                    {serverStatus.online
                      ? `Connected · ${serverStatus.latency_ms} ms`
                      : 'Connection unavailable. Try again shortly.'}
                  </p>
                )}
                {serverError && (
                  <p role="status" className="server-check-error">
                    {serverError}{' '}
                    {!signedIn && <Link href="/login">Sign in</Link>}
                  </p>
                )}
                <small>
                  Latency is measured from Forged’s server to the processing
                  server.
                </small>
                <fieldset disabled={busy}>
                  <legend>Patch method</legend>
                  <p>
                    Orion is recommended. Try Luna if Orion does not work for
                    your video.
                  </p>
                  <div className="patch-method-buttons">
                    {(['orion', 'luna'] as const).map((method) => (
                      <Button
                        key={method}
                        type="button"
                        variant={
                          patchMethod === method ? 'default' : 'secondary'
                        }
                        aria-pressed={patchMethod === method}
                        onClick={() => setPatchMethod(method)}
                      >
                        {method === 'orion' ? 'Orion' : 'Luna'}
                      </Button>
                    ))}
                  </div>
                  <p className="patch-warning">
                    {patchMethod === 'orion'
                      ? 'Upload to TikTok as Everyone or Friends Only, rather than Only Me.'
                      : 'Luna is an experimental fallback and requires a 30 or 60 FPS source.'}
                  </p>
                </fieldset>
              </section>
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
                    <span aria-live="polite">
                      {finalizingUpload
                        ? 'Verifying your upload…'
                        : 'Uploading to secure storage'}
                    </span>
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
                    {finalizingUpload
                      ? 'Verifying upload…'
                      : busy
                        ? 'Uploading…'
                        : 'Upload video'}
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
                <h3 aria-live="polite">
                  {starting && job.status === 'uploaded'
                    ? 'Starting optimization…'
                    : job.status === 'failed'
                      ? 'This video needs another try'
                      : job.status === 'cancelled'
                        ? 'Processing cancelled'
                        : stages[job.provider_stage || job.status] ||
                          job.status}
                </h3>
                {(optimizationActive || job.status === 'completed') && (
                  <div className="optimization-progress">
                    <div className="optimization-progress-label">
                      <span>
                        {completedStages === 5
                          ? 'Optimization complete'
                          : `Stage ${completedStages + 1} of 5`}
                      </span>
                      {percent !== undefined && (
                        <span>{percent}% of this stage</span>
                      )}
                    </div>
                    <div
                      className="optimization-progress-track"
                      role="progressbar"
                      aria-label="Optimization stages completed"
                      aria-valuemin={0}
                      aria-valuemax={5}
                      aria-valuenow={completedStages}
                      aria-valuetext={`${completedStages} of 5 stages complete`}
                    >
                      <span style={{ width: `${completedStages * 20}%` }} />
                    </div>
                  </div>
                )}
                {job.error_message && (
                  <p>
                    {job.error_message.replace(
                      /TikQuick/gi,
                      'The processing service',
                    )}
                  </p>
                )}
                {job.status === 'processing' &&
                  job.provider_stage === 'sending' &&
                  job.progress.uploaded_bytes !== undefined &&
                  job.progress.total_bytes && (
                    <p>
                      {formatBytes(job.progress.uploaded_bytes)} of{' '}
                      {formatBytes(job.progress.total_bytes)} sent
                    </p>
                  )}
                {job.progress.received_bytes !== undefined && (
                  <p>{formatBytes(job.progress.received_bytes)} received</p>
                )}
                {job.status === 'uploaded' && !starting && (
                  <Button onClick={() => action('start')}>
                    Start optimization <ArrowRight size={17} />
                  </Button>
                )}
                {job.status === 'completed' && (
                  <>
                    <Button onClick={() => action('download')}>
                      <Download size={17} /> Download optimised video
                    </Button>
                    <div className="optimised-details">
                      <div className="optimised-details-heading">
                        <Check size={17} />
                        <strong>Optimisation complete</strong>
                      </div>
                      <p className="optimised-filename">{job.filename}</p>
                      <dl className="video-specs">
                        <div>
                          <dt>Optimised file size</dt>
                          <dd>
                            {job.output_size_bytes
                              ? formatBytes(job.output_size_bytes)
                              : 'Not available'}
                          </dd>
                        </div>
                        <div>
                          <dt>Resolution</dt>
                          <dd>
                            {(() => {
                              const video = job.output_metadata?.streams.find(
                                (s) => s.codec_type === 'video',
                              );
                              return video?.width && video.height
                                ? `${video.width} × ${video.height}`
                                : 'Not available';
                            })()}
                          </dd>
                        </div>
                        <div>
                          <dt>Video codec</dt>
                          <dd>
                            {job.output_metadata?.streams
                              .find((s) => s.codec_type === 'video')
                              ?.codec_name?.toUpperCase() || 'Not available'}
                          </dd>
                        </div>
                        <div>
                          <dt>Duration</dt>
                          <dd>
                            {(() => {
                              const duration =
                                (job.output_metadata?.validation ===
                                'tikquick_content'
                                  ? job.input_metadata?.duration
                                  : job.output_metadata?.duration) ??
                                job.input_metadata?.duration;
                              return duration && Number.isFinite(duration)
                                ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
                                : 'Not available';
                            })()}
                          </dd>
                        </div>
                        <div>
                          <dt>Audio</dt>
                          <dd>
                            {job.output_metadata?.streams
                              .find((s) => s.codec_type === 'audio')
                              ?.codec_name?.toUpperCase() || 'No audio track'}
                          </dd>
                        </div>
                        <div>
                          <dt>Processing mode</dt>
                          <dd>
                            {job.use_encoder
                              ? 'Re-encoded and optimised'
                              : 'Optimised without re-encoding'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    {job.output_metadata?.validation === 'tikquick_content' && (
                      <p>
                        Video content verified. Download your optimised video
                        for upload to TikTok. Its special timing samples may
                        prevent playback in ordinary video players.
                      </p>
                    )}
                    <div className="auto-post-panel">
                      <h4>Post directly to TikTok</h4>
                      <p>
                        Use your own Zernio API key. It stays in this page
                        session and is sent securely to Forged when you connect,
                        post or check a post’s status.
                      </p>
                      <label htmlFor="zernio-key">Zernio API key</label>
                      <input
                        id="zernio-key"
                        type="password"
                        autoComplete="off"
                        placeholder="Paste your Zernio API key"
                        value={zernioKey}
                        disabled={postBusy || publishStage === 'submitted'}
                        onChange={(e) => setZernioKey(e.target.value)}
                      />
                      <a
                        href="https://zernio.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Get your API key or connect TikTok in Zernio ↗
                      </a>
                      <Button
                        variant="secondary"
                        onClick={connectZernio}
                        disabled={
                          postBusy || publishStage === 'submitted' || !zernioKey
                        }
                      >
                        Connect Zernio
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void checkPublishStatus()}
                        disabled={
                          postBusy || publishStage === 'submitted' || !zernioKey
                        }
                      >
                        Check TikTok status
                      </Button>
                      {zernioAccounts.length > 0 && (
                        <>
                          <label htmlFor="post-account">TikTok account</label>
                          <select
                            id="post-account"
                            value={postAccount}
                            onChange={(e) =>
                              void selectPostAccount(e.target.value)
                            }
                          >
                            <option value="">Choose an account</option>
                            {zernioAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                @{account.username}
                              </option>
                            ))}
                          </select>
                          <label htmlFor="post-caption">Caption</label>
                          <textarea
                            id="post-caption"
                            value={caption}
                            maxLength={2200}
                            rows={3}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Write your TikTok caption"
                          />
                          <label htmlFor="post-privacy">
                            Who can see this post?
                          </label>
                          <select
                            id="post-privacy"
                            value={privacy}
                            onChange={(e) => setPrivacy(e.target.value)}
                          >
                            <option value="">Choose privacy</option>
                            {privacyOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <label className="post-consent">
                            <input
                              type="checkbox"
                              checked={allowComment}
                              disabled={
                                postInteractions.allow_comment?.enabled ===
                                false
                              }
                              onChange={(e) =>
                                setAllowComment(e.target.checked)
                              }
                            />
                            Allow comments
                          </label>
                          <label className="post-consent">
                            <input
                              type="checkbox"
                              checked={allowDuet}
                              disabled={
                                postInteractions.allow_duet?.enabled === false
                              }
                              onChange={(e) => setAllowDuet(e.target.checked)}
                            />
                            Allow duets
                          </label>
                          <label className="post-consent">
                            <input
                              type="checkbox"
                              checked={allowStitch}
                              disabled={
                                postInteractions.allow_stitch?.enabled === false
                              }
                              onChange={(e) => setAllowStitch(e.target.checked)}
                            />
                            Allow stitches
                          </label>
                          <label className="post-consent">
                            <input
                              type="checkbox"
                              checked={postConsent}
                              onChange={(e) => setPostConsent(e.target.checked)}
                            />
                            I have reviewed this video and caption and consent
                            to posting it to the selected TikTok account.
                          </label>
                          <button
                            type="button"
                            className="auto-post-button"
                            disabled={
                              postBusy ||
                              publishStage === 'submitted' ||
                              publishStage === 'pending' ||
                              publishStage === 'posted' ||
                              !postAccount ||
                              !privacy ||
                              !caption.trim() ||
                              !postConsent
                            }
                            onClick={() => void publishToTikTok()}
                          >
                            {publishStage === 'uploading'
                              ? 'Posting…'
                              : publishStage === 'posted'
                                ? 'Posted!'
                                : publishStage === 'submitted'
                                  ? 'Checking TikTok…'
                                  : publishStage === 'pending'
                                    ? 'Confirmation pending'
                                    : '♪ AUTO POST TO TIKTOK'}
                          </button>
                        </>
                      )}
                      {publishStage !== 'idle' && (
                        <div
                          className="publish-progress"
                          role="status"
                          aria-live="polite"
                        >
                          <span>
                            {publishStage === 'uploading'
                              ? 'Uploading and posting…'
                              : publishStage === 'posted'
                                ? 'Posted to TikTok'
                                : publishStage === 'submitted'
                                  ? 'Submitted to Zernio. Checking whether TikTok published it…'
                                  : publishStage === 'pending'
                                    ? 'TikTok hasn’t confirmed the post yet. Check again here or in Zernio.'
                                    : 'TikTok did not confirm publication. Check Zernio for details.'}
                          </span>
                          <div
                            className={`publish-progress-track ${['uploading', 'submitted'].includes(publishStage) ? 'is-publishing' : ''}`}
                            role="progressbar"
                            aria-label="TikTok publishing"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={
                              publishStage === 'posted' ? 100 : undefined
                            }
                          >
                            <div
                              className="publish-progress-fill"
                              style={{
                                width:
                                  publishStage === 'posted'
                                    ? '100%'
                                    : publishStage === 'submitted'
                                      ? '30%'
                                      : publishStage === 'uploading'
                                        ? '22%'
                                        : '0%',
                              }}
                            />
                          </div>
                        </div>
                      )}
                      {zernioAccounts.length === 0 && zernioKey && (
                        <p>
                          Connect a TikTok account in Zernio before posting.
                        </p>
                      )}
                      {postResult && <p role="status">{postResult}</p>}
                    </div>
                  </>
                )}
                {['queued', 'processing'].includes(job.status) && (
                  <Button
                    variant="secondary"
                    className="cancel-processing-button"
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
                      setPublishStage('idle');
                      setPostResult('');
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
                    Your video is being optimized. Follow each stage right here.
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
