import { open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { AppError, byteRanges, ENCODER_MAX_BYTES } from '@tikquick/shared';

const hosts = {
  passport: ['tikquick.online', 'api.tikqcapi.site'],
  ps: ['byte.tikqcapi.site', 'ps.tikquick.online', 'tqps.mikeden.site'],
  encoder: ['encoder.tikquick.online', 'vapi.tikqcapi.site'],
};
export function approvedBase(value: string, kind: keyof typeof hosts) {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    !hosts[kind].includes(u.hostname) ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/'
  )
    throw new AppError('PROVIDER_CONFIG', 'Unapproved provider origin', 500);
  return u.origin;
}
export function parseOTU(value: unknown, now = Date.now()) {
  const token = z
    .object({
      token: z.string().min(1),
      user_id: z.string().min(1),
      expires_at: z.string().min(1),
    })
    .parse(value);
  // The contract shows a timestamp without a timezone. Never interpret it in the host timezone.
  // Default UTC is configurable pending provider confirmation; mint immediately regardless.
  const raw = token.expires_at.replace(' ', 'T');
  const expires = Date.parse(
    /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw)
      ? raw
      : raw + (process.env.TIKQUICK_TOKEN_TIMEZONE_OFFSET || 'Z'),
  );
  if (!Number.isFinite(expires) || expires <= now + 5000)
    throw new AppError(
      'TOKEN_EXPIRED',
      'Provider issued an expired or invalid token',
      502,
    );
  return token;
}
export class ProviderError extends AppError {
  constructor(
    code: string,
    public retryable = false,
  ) {
    super(
      code,
      'The processing provider could not complete this operation.',
      502,
    );
  }
}
export type ProviderProgress = {
  stage: string;
  uploaded_bytes?: number;
  total_bytes?: number;
  encoder_percent?: number;
  encoder_event?: string;
  provider_job_id?: string;
};
export type Source = { path: string; filename: string; size: number };
export type Hooks = {
  signal: AbortSignal;
  progress: (value: ProviderProgress) => Promise<void>;
  beforeComplete: () => Promise<void>;
};
type Session = { job_id: string; job_otu: string };
export function encoderOutputId(
  encoded: string,
  origin = 'https://vapi.tikqcapi.site',
) {
  if (encoded.length > 2048 || !/^[-A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new ProviderError('ENCODER_OUTPUT_URL');
  let url: URL;
  try {
    url = new URL(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new ProviderError('ENCODER_OUTPUT_URL');
  }
  const match =
    /^\/out\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.mp4$/i.exec(
      url.pathname,
    );
  if (
    url.origin !== approvedBase(origin, 'encoder') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    throw new ProviderError('ENCODER_OUTPUT_URL');
  return match[1];
}
export async function* sseEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(),
    decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 65536) throw new ProviderError('SSE_FRAME_TOO_LARGE');
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('\n');
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed.event === 'string')
            yield parsed as {
              event: string;
              percent?: number;
              output_url_base64?: string;
            };
        } catch {
          /* Provider permits malformed frames to be ignored. */
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
type Config = {
  key: string;
  passport?: string;
  ps?: string;
  encoder?: string;
  chunkBytes?: number;
  concurrency?: number;
  attempts?: number;
  retryBaseMs?: number;
  fetch?: typeof fetch;
};
const sessionSchema = z.object({
  job_id: z.string().min(1),
  job_otu: z.string().min(1),
});
export class TikQuick {
  readonly passport: string;
  readonly ps: string;
  readonly encoder: string;
  private fetcher: typeof fetch;
  private chunkBytes: number;
  private concurrency: number;
  private attempts: number;
  private retryBase: number;
  constructor(private config: Config) {
    this.passport = approvedBase(
      config.passport || 'https://api.tikqcapi.site',
      'passport',
    );
    this.ps = approvedBase(config.ps || 'https://byte.tikqcapi.site', 'ps');
    this.encoder = approvedBase(
      config.encoder || 'https://vapi.tikqcapi.site',
      'encoder',
    );
    this.fetcher = config.fetch || fetch;
    this.chunkBytes = config.chunkBytes ?? 20971520;
    this.concurrency = config.concurrency ?? 2;
    this.attempts = config.attempts ?? 5;
    this.retryBase = config.retryBaseMs ?? 600;
    if (
      !config.key ||
      !Number.isInteger(this.chunkBytes) ||
      this.chunkBytes < 1 ||
      this.chunkBytes > 20971520 ||
      !Number.isInteger(this.concurrency) ||
      this.concurrency < 1 ||
      this.concurrency > 2 ||
      !Number.isInteger(this.attempts) ||
      this.attempts < 1 ||
      this.attempts > 5 ||
      !Number.isFinite(this.retryBase) ||
      this.retryBase < 0
    )
      throw new AppError(
        'PROVIDER_CONFIG',
        'Invalid provider configuration',
        500,
      );
  }
  private async request(
    base: string,
    path: string,
    query: Record<string, string>,
    init: RequestInit,
    signal: AbortSignal,
    timeout = 120000,
  ) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    try {
      const res = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new ProviderError(
          `PROVIDER_HTTP_${res.status}`,
          res.status === 408 || res.status === 429 || res.status >= 500,
        );
      }
      return res;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      signal.throwIfAborted();
      throw new ProviderError('PROVIDER_CONNECTION', true);
    }
  }
  private async json(
    base: string,
    path: string,
    query: Record<string, string>,
    init: RequestInit,
    h: Hooks,
  ) {
    const r = await this.request(base, path, query, init, h.signal);
    const text = await r.text();
    if (text.length > 65536) throw new ProviderError('PROVIDER_RESPONSE');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError('PROVIDER_RESPONSE');
    }
  }
  private async init(
    filename: string,
    size: number,
    total: number,
    h: Hooks,
    method: 'orion' | 'luna' = 'orion',
  ): Promise<Session> {
    await h.progress({ stage: 'connecting' });
    const token = parseOTU(
      await this.json(
        this.passport,
        '/passport/api/thirdparty/genotu',
        { key: this.config.key },
        { method: 'GET' },
        h,
      ),
    );
    const session = sessionSchema.parse(
      await this.json(
        this.ps,
        '/api/upload/init',
        {
          auth_userid: token.user_id,
          auth_token: token.token,
          selectmethod: method,
        },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename,
            total_size: size,
            total_chunks: total,
          }),
        },
        h,
      ),
    );
    await h.progress({ stage: 'connecting', provider_job_id: session.job_id });
    return session;
  }
  private async chunks(
    source: Source,
    base: string,
    path: (i: number) => string,
    query: (i: number) => Record<string, string>,
    chunkSize: number,
    first: number,
    h: Hooks,
  ) {
    const file = await open(source.path, 'r');
    const ranges = byteRanges(source.size, chunkSize, first);
    let cursor = 0,
      committed = 0;
    const abort = new AbortController();
    const signal = AbortSignal.any([h.signal, abort.signal]);
    let progress = Promise.resolve();
    try {
      const results = await Promise.allSettled(
        Array.from({ length: this.concurrency }, async () => {
          try {
            while (cursor < ranges.length) {
              signal.throwIfAborted();
              const r = ranges[cursor++];
              const bytes = Buffer.alloc(r.end - r.start);
              let offset = 0;
              while (offset < bytes.length) {
                const read = await file.read(
                  bytes,
                  offset,
                  bytes.length - offset,
                  r.start + offset,
                );
                if (!read.bytesRead)
                  throw new ProviderError('SOURCE_TRUNCATED');
                offset += read.bytesRead;
              }
              for (let attempt = 1; ; attempt++) {
                try {
                  const response = await this.request(
                    base,
                    path(r.index),
                    query(r.index),
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/octet-stream' },
                      body: bytes,
                    },
                    signal,
                  );
                  await response.body?.cancel();
                  break;
                } catch (e) {
                  if (
                    !(e instanceof ProviderError) ||
                    !e.retryable ||
                    attempt >= this.attempts
                  )
                    throw e;
                  await delay(
                    this.retryBase *
                      2 ** (attempt - 1) *
                      (0.75 + Math.random() * 0.5),
                    undefined,
                    { signal },
                  );
                }
              }
              committed += bytes.length;
              const count = committed;
              progress = progress.then(() =>
                h.progress({
                  stage: 'sending',
                  uploaded_bytes: count,
                  total_bytes: source.size,
                }),
              );
              await progress;
            }
          } catch (e) {
            abort.abort();
            throw e;
          }
        }),
      );
      const failure = results.find((r) => r.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } finally {
      await file.close();
    }
  }
  private async complete(session: Session, h: Hooks, encId?: string) {
    await h.progress({ stage: 'patching' });
    await h.beforeComplete();
    // Exactly once per local attempt. Neither transient errors nor partial bodies are retried.
    const response = await this.request(
      this.ps,
      '/api/upload/complete',
      { ...session, ...(encId ? { enc_id: encId } : {}) },
      { method: encId ? 'GET' : 'POST' },
      h.signal,
      30 * 60 * 1000,
    );
    if (
      !response.body ||
      /json|text\/html/i.test(response.headers.get('content-type') || '')
    ) {
      await response.body?.cancel();
      throw new ProviderError('PROVIDER_NOT_VIDEO');
    }
    await h.progress({ stage: 'receiving' });
    return response;
  }
  async standard(source: Source, h: Hooks, method: 'orion' | 'luna' = 'orion') {
    const session = await this.init(
      source.filename,
      source.size,
      Math.ceil(source.size / this.chunkBytes),
      h,
      method,
    );
    await this.chunks(
      source,
      this.ps,
      () => '/api/upload/chunk',
      (i) => ({ ...session, chunk_index: String(i) }),
      this.chunkBytes,
      0,
      h,
    );
    return this.complete(session, h);
  }
  async encoded(source: Source, h: Hooks, method: 'orion' | 'luna' = 'orion') {
    if (source.size > ENCODER_MAX_BYTES)
      throw new AppError(
        'ENCODER_LIMIT',
        'Encoder input must be at most 1500 MB.',
      );
    await h.progress({ stage: 'connecting' });
    const token = z
      .object({ token: z.string().min(1), encoder_server: z.string() })
      .parse(
        await this.json(
          this.passport,
          '/passport/api/thirdparty/genenc',
          { key: this.config.key },
          { method: 'GET' },
          h,
        ),
      );
    if (approvedBase(token.encoder_server, 'encoder') !== this.encoder)
      throw new ProviderError('ENCODER_ORIGIN');
    const job = z
      .object({ jobid: z.string().min(1), jobtoken: z.string().min(1) })
      .parse(
        await this.json(
          this.encoder,
          '/api/make',
          { token: token.token },
          { method: 'POST' },
          h,
        ),
      );
    await h.progress({ stage: 'connecting', provider_job_id: job.jobid });
    await this.chunks(
      source,
      this.encoder,
      (i) => `/api/upload/${i}`,
      () => job,
      5 * 1024 * 1024,
      1,
      h,
    );
    const finish = z
      .object({ sse: z.string() })
      .parse(
        await this.json(
          this.encoder,
          '/api/upload/finish',
          job,
          { method: 'POST' },
          h,
        ),
      );
    const progressUrl = new URL(finish.sse, this.encoder);
    if (
      progressUrl.origin !== this.encoder ||
      progressUrl.username ||
      progressUrl.password ||
      progressUrl.search ||
      progressUrl.hash ||
      !progressUrl.pathname.startsWith('/api/progress/') ||
      progressUrl.pathname !== `/api/progress/${encodeURIComponent(job.jobid)}`
    )
      throw new ProviderError('ENCODER_PROGRESS_URL');
    let encId: string | undefined;
    for (let attempt = 0; attempt < 4 && !encId; attempt++) {
      if (attempt)
        await delay(this.retryBase * 2 ** attempt, undefined, {
          signal: h.signal,
        });
      try {
        const response = await this.request(
          this.encoder,
          progressUrl.pathname,
          {},
          { method: 'GET' },
          h.signal,
          20 * 60 * 1000,
        );
        if (!response.body) throw new ProviderError('ENCODER_STREAM');
        for await (const event of sseEvents(response.body)) {
          if (event.event === 'failed')
            throw new ProviderError('ENCODER_FAILED');
          if (event.event === 'done') {
            encId = encoderOutputId(
              event.output_url_base64 || '',
              this.encoder,
            );
            break;
          }
          if (
            ['queued', 'setting_up_env', 'rendering', 'processing'].includes(
              event.event,
            )
          )
            await h.progress({
              stage: 'encoding',
              encoder_event: event.event,
              ...(event.event === 'rendering' &&
              typeof event.percent === 'number' &&
              Number.isFinite(event.percent)
                ? { encoder_percent: Math.max(0, Math.min(100, event.percent)) }
                : {}),
            });
        }
      } catch (e) {
        h.signal.throwIfAborted();
        if (e instanceof ProviderError && !e.retryable) throw e;
      }
    }
    if (!encId) throw new ProviderError('ENCODER_PROGRESS_LOST');
    const session = await this.init(`${encId}.mp4`, 1, 1, h, method);
    return this.complete(session, h, encId);
  }
}
