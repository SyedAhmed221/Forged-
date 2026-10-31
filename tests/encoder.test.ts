import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  TikQuick,
  encoderOutputId,
  sseEvents,
} from '../services/worker/src/providers/tikquick';
const uuid = '12345678-1234-1234-1234-123456789abc';
const encoded = Buffer.from(
  `https://vapi.tikqcapi.site/out/${uuid}.mp4`,
).toString('base64');
it('parses split SSE frames, CRLF, malformed messages and rendering percentages', async () => {
  const parts = [
    'data: nope\r\n\r\ndata: {"event":"rende',
    'ring","percent":42}\r',
    '\n\r\ndata: {"event":"done"}\n\n',
  ];
  const stream = new ReadableStream({
    start(c) {
      parts.forEach((p) => c.enqueue(new TextEncoder().encode(p)));
      c.close();
    },
  });
  const events = [];
  for await (const e of sseEvents(stream)) events.push(e);
  expect(events).toEqual([
    { event: 'rendering', percent: 42 },
    { event: 'done' },
  ]);
});
it('strictly validates decoded encoder output origins and UUID paths', () => {
  expect(encoderOutputId(encoded)).toBe(uuid);
  for (const u of [
    `http://encoder.tikquick.online/out/${uuid}.mp4`,
    `https://evil.test/out/${uuid}.mp4`,
    `https://encoder.tikquick.online/out/${uuid}.mp4?next=evil`,
    `https://u:p@encoder.tikquick.online/out/${uuid}.mp4`,
  ])
    expect(() => encoderOutputId(Buffer.from(u).toString('base64'))).toThrow();
});
it('uses 1-based encoder chunks, reconnects SSE, then initializes placeholders and completes with GET', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forged-encoder-'));
  const path = join(dir, 'in.mp4');
  await writeFile(path, 'video');
  let connections = 0;
  const calls: string[] = [];
  const fake = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push(`${init?.method} ${u.pathname}`);
    if (u.pathname.endsWith('genenc'))
      return Response.json({
        token: 'enc',
        encoder_server: 'https://vapi.tikqcapi.site',
      });
    if (u.pathname === '/api/make')
      return Response.json({ jobid: 'job', jobtoken: 'secret' });
    if (u.pathname === '/api/upload/1') return Response.json({ status: 'ok' });
    if (u.pathname.endsWith('/finish'))
      return Response.json({ sse: '/api/progress/job' });
    if (u.pathname.startsWith('/api/progress')) {
      connections++;
      return new Response(
        connections === 1
          ? 'data: {"event":"queued"}\n\n'
          : `data: {"event":"done","output_url_base64":"${encoded}"}\n\n`,
      );
    }
    if (u.pathname.endsWith('genotu'))
      return Response.json({
        token: 'ps',
        user_id: 'u',
        expires_at: '2099-01-01 00:00:00',
      });
    if (u.pathname.endsWith('/init')) {
      expect(JSON.parse(String(init?.body))).toEqual({
        filename: `${uuid}.mp4`,
        total_size: 1,
        total_chunks: 1,
      });
      return Response.json({ job_id: 'ps', job_otu: 'secret' });
    }
    expect(init?.method).toBe('GET');
    expect(u.searchParams.get('enc_id')).toBe(uuid);
    return new Response('binary');
  }) as typeof fetch;
  try {
    const r = await new TikQuick({
      key: 'test',
      fetch: fake,
      retryBaseMs: 1,
    }).encoded(
      { path, filename: 'in.mp4', size: 5 },
      {
        signal: new AbortController().signal,
        progress: async () => {},
        beforeComplete: async () => {},
      },
    );
    expect(await r.text()).toBe('binary');
    expect(connections).toBe(2);
    expect(calls).not.toContain('POST /api/upload/0');
    expect(calls).not.toContain('POST /api/upload/chunk');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
