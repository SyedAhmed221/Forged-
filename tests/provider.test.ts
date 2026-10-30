import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import {
  TikQuick,
  parseOTU,
  approvedBase,
} from '../services/worker/src/providers/tikquick';
import { byteRanges, recoveryDecision } from '../packages/shared/src';
describe('standard upload-to-download contract', () => {
  it('uploads exact raw chunks with bounded concurrency and streams the binary result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forged-test-'));
    const source = Buffer.from('0123456789a');
    await writeFile(join(dir, 'in.mp4'), source);
    const chunks = new Map<number, Buffer>();
    let active = 0,
      max = 0,
      complete = 0;
    const failures = new Set<number>();
    const fake = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = new URL(String(input));
      if (u.pathname.endsWith('genotu'))
        return Response.json({
          token: 'secret',
          user_id: 'user',
          expires_at: '2099-01-01 00:00:00',
        });
      if (u.pathname.endsWith('/init')) {
        expect(JSON.parse(String(init?.body))).toEqual({
          filename: 'in.mp4',
          total_size: 11,
          total_chunks: 3,
        });
        return Response.json({ job_id: 'job', job_otu: 'otu' });
      }
      if (u.pathname.endsWith('/chunk')) {
        const index = Number(u.searchParams.get('chunk_index'));
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        if (index === 1 && !failures.has(index)) {
          failures.add(index);
          return new Response('', { status: 503 });
        }
        chunks.set(index, Buffer.from(init?.body as Uint8Array));
        return new Response('ok');
      }
      expect(init?.method).toBe('POST');
      complete++;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([0, 0, 0, 24]));
            c.enqueue(new TextEncoder().encode('ftypisom'));
            c.close();
          },
        }),
        { headers: { 'content-type': 'video/mp4' } },
      );
    }) as typeof fetch;
    try {
      const events: unknown[] = [];
      let begun = false;
      const res = await new TikQuick({
        key: 'test',
        fetch: fake,
        chunkBytes: 4,
        retryBaseMs: 1,
      }).standard(
        { path: join(dir, 'in.mp4'), filename: 'in.mp4', size: 11 },
        {
          signal: new AbortController().signal,
          progress: async (p) => {
            events.push(p);
          },
          beforeComplete: async () => {
            begun = true;
          },
        },
      );
      await pipeline(
        Readable.fromWeb(
          res.body! as import('node:stream/web').ReadableStream<Uint8Array>,
        ),
        createWriteStream(join(dir, 'download.mp4')),
      );
      expect(
        Buffer.concat([chunks.get(0)!, chunks.get(1)!, chunks.get(2)!]),
      ).toEqual(source);
      expect(max).toBe(2);
      expect(complete).toBe(1);
      expect(begun).toBe(true);
      expect(events).toContainEqual({
        stage: 'sending',
        uploaded_bytes: 11,
        total_bytes: 11,
      });
      expect((await readFile(join(dir, 'download.mp4'))).toString()).toContain(
        'ftypisom',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('rejects expired/malformed tokens and unapproved hosts', () => {
    expect(() =>
      parseOTU({ token: 'x', user_id: 'u', expires_at: '2000-01-01 00:00:00' }),
    ).toThrow();
    expect(() => parseOTU({ token: 'x' })).toThrow();
    expect(() =>
      approvedBase('https://ps.tikquick.online.evil.test', 'ps'),
    ).toThrow();
    expect(() =>
      approvedBase('https://ps.tikquick.online@evil.test', 'ps'),
    ).toThrow();
  });
  it('calculates partial ranges and distinct index bases', () => {
    expect(byteRanges(11, 4)).toEqual([
      { index: 0, start: 0, end: 4 },
      { index: 1, start: 4, end: 8 },
      { index: 2, start: 8, end: 11 },
    ]);
    expect(byteRanges(11, 4, 1).map((r) => r.index)).toEqual([1, 2, 3]);
  });
  it('restarts pre-completion crashes but fences ambiguous completions', () => {
    expect(recoveryDecision(false, 1)).toBe('restart');
    expect(recoveryDecision(true, 1)).toBe('ambiguous');
    expect(recoveryDecision(false, 3)).toBe('failed');
  });
});
