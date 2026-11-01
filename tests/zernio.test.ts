import { afterEach, expect, it, vi } from 'vitest';
import {
  approvedMediaUrl,
  creatorInfo,
  tiktokAccounts,
} from '../apps/web/lib/zernio';

afterEach(() => vi.unstubAllGlobals());

it('lists only active TikTok accounts for the supplied key and reads creator settings', async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer user-owned-key',
      });
      calls.push(url);
      if (url.endsWith('/v1/accounts'))
        return Response.json({
          accounts: [
            {
              _id: '1234567890abcdef12345678',
              platform: 'tiktok',
              username: 'creator',
              isActive: true,
            },
            { _id: 'inactive12345678', platform: 'tiktok', isActive: false },
            { _id: 'other1234567890', platform: 'instagram', isActive: true },
          ],
        });
      return Response.json({
        creator: { canPostMore: true },
        privacyLevels: [{ value: 'PUBLIC_TO_EVERYONE', label: 'Public' }],
        postingLimits: { maxVideoDurationSec: 600 },
      });
    }),
  );
  expect(await tiktokAccounts('user-owned-key')).toEqual([
    { id: '1234567890abcdef12345678', username: 'creator' },
  ]);
  expect(
    (await creatorInfo('user-owned-key', '1234567890abcdef12345678'))
      .privacyLevels,
  ).toEqual([{ value: 'PUBLIC_TO_EVERYONE', label: 'Public' }]);
  await expect(
    creatorInfo('user-owned-key', 'anotheraccount12'),
  ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  expect(calls.filter((url) => url.includes('creator-info'))).toHaveLength(1);
});

it('rejects media addresses outside Zernio', () => {
  expect(
    approvedMediaUrl(
      'https://media.zernio.com/temp/test.mp4',
      'media.zernio.com',
    ),
  ).toContain('/temp/test.mp4');
  for (const url of [
    'http://media.zernio.com/file',
    'https://media.zernio.com.evil.test/file',
    'https://user@media.zernio.com/file',
  ])
    expect(() => approvedMediaUrl(url, 'media.zernio.com')).toThrow();
});
