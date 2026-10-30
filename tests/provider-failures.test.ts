import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TikQuick } from '../services/worker/src/providers/tikquick';
async function attempt(fail: 'authentication' | 'completion' | 'transient') {
  const dir = await mkdtemp(join(tmpdir(), 'forged-failure-'));
  const path = join(dir, 'source');
  await writeFile(path, 'video');
  let chunks = 0,
    completions = 0,
    begun = false;
  const fetcher = (async (input: URL | RequestInfo) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith('genotu'))
      return Response.json({
        token: 'secret',
        user_id: 'user',
        expires_at: '2099-01-01 00:00:00',
      });
    if (u.pathname.endsWith('/init'))
      return Response.json({ job_id: 'id', job_otu: 'secret' });
    if (u.pathname.endsWith('/chunk')) {
      chunks++;
      return new Response('', {
        status:
          fail === 'authentication' ? 403 : fail === 'transient' ? 503 : 200,
      });
    }
    completions++;
    throw new Error(
      'Connection closed after the provider may have consumed the token',
    );
  }) as typeof fetch;
  try {
    await expect(
      new TikQuick({ key: 'test', fetch: fetcher, retryBaseMs: 0 }).standard(
        { path, filename: 'video.mp4', size: 5 },
        {
          signal: new AbortController().signal,
          progress: async () => {},
          beforeComplete: async () => {
            begun = true;
          },
        },
      ),
    ).rejects.toThrow();
    return { chunks, completions, begun };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
it('does not retry a permanent authentication failure', async () => {
  expect(await attempt('authentication')).toEqual({
    chunks: 1,
    completions: 0,
    begun: false,
  });
});
it('limits transient chunk errors to five attempts', async () => {
  expect(await attempt('transient')).toEqual({
    chunks: 5,
    completions: 0,
    begun: false,
  });
});
it('never retries an ambiguous completion request', async () => {
  expect(await attempt('completion')).toEqual({
    chunks: 1,
    completions: 1,
    begun: true,
  });
});
