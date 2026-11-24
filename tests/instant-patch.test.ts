import { afterEach, expect, it, vi } from 'vitest';
import { POST } from '../apps/web/app/api/instant-patch/route';

vi.mock('../apps/web/lib/billing', () => ({
  entitlement: async () => ({
    bytes: 1_000_000,
    shortEdge: 1080,
    longEdge: 1920,
    fps: 60,
    daily: 10,
  }),
}));
vi.mock('../apps/web/lib/jobs', () => ({ reserveVideo: async () => {} }));
vi.mock('../apps/web/lib/mp4-prefix', () => ({
  maxPrefixBytes: 1_000_000,
  inspectMp4Prefix: () => ({ width: 720, height: 1280, fps: 30 }),
}));
vi.mock('../apps/web/lib/server', () => ({
  endpoint:
    (handler: (request: Request, userId: string) => Promise<unknown>) =>
    (request: Request) =>
      handler(request, 'test-user'),
  transaction: (
    _userId: string,
    callback: (db: {
      query: () => Promise<{ rows: { acquired: boolean }[] }>;
    }) => Promise<unknown>,
  ) => callback({ query: async () => ({ rows: [{ acquired: true }] }) }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('gets a new token after a patch authentication failure and returns the patch', async () => {
  vi.stubEnv('TIKQUICK_API_KEY', 'test-key');
  const firstToken = 'a'.repeat(64);
  const secondToken = 'b'.repeat(64);
  let tickets = 0;
  const usedTokens: (string | null)[] = [];
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname.endsWith('/genotu')) {
      tickets++;
      return Response.json({
        user_id: 'provider-user',
        token: tickets === 1 ? firstToken : secondToken,
      });
    }
    const token = url.searchParams.get('auth_token');
    usedTokens.push(token);
    if (token !== secondToken) return new Response(null, { status: 503 });
    return Response.json({
      patched_prefix_b64: 'AQID',
      patched_prefix_size: 3,
      client_prefix_size: 2,
      ghost_sample_hex: '04',
      ghost_offset: 11,
      final_size: 12,
    });
  });
  const request = new Request('https://example.com/api/instant-patch', {
    method: 'POST',
    headers: { 'X-Original-File-Size': '10' },
    body: new Uint8Array([1, 2]),
  });

  await expect(POST(request)).resolves.toEqual({
    fallback: false,
    prefix: 'AQID',
    ghost: '04',
    size: 12,
  });
  expect(usedTokens).toEqual([firstToken, secondToken]);
});
