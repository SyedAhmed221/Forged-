import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sign: vi.fn(),
  seal: vi.fn(),
}));
vi.mock('../apps/web/lib/billing', () => ({
  entitlement: vi.fn(async () => ({ tier: 'free', bytes: 70_000_000, daily: 1 })),
}));
vi.mock('../apps/web/lib/server', () => ({
  transaction: async (_user: string, fn: (db: unknown) => unknown) =>
    fn({ query: mocks.query }),
  ownJob: async (
    db: { query: typeof mocks.query },
    id: string,
    user: string,
  ) => {
    const r = await db.query('owned', [id, user]);
    if (!r.rows.length) throw new Error('not found');
    return r.rows[0];
  },
  publicColumns: 'id,filename',
}));
vi.mock('../packages/shared/src/storage', () => ({
  presignUpload: vi.fn(async () => 'https://storage.example/put'),
  sealUpload: mocks.seal,
  downloadUrl: mocks.sign,
}));
import { jobAction, createUpload } from '../apps/web/lib/jobs';
const id = '12345678-1234-4234-8234-123456789abc';
beforeEach(() => {
  vi.clearAllMocks();
});
it('never signs a download for a job outside the authenticated owner', async () => {
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  await expect(jobAction(id, 'download', 'GET', 'owner')).rejects.toThrow();
  expect(mocks.query).toHaveBeenCalledWith('owned', [id, 'owner']);
  expect(mocks.sign).not.toHaveBeenCalled();
});
it('only signs completed, unexpired downloads', async () => {
  mocks.query.mockResolvedValue({
    rows: [{ status: 'processing', output_object_key: 'output' }],
  });
  await expect(jobAction(id, 'download', 'GET', 'owner')).rejects.toThrow();
  expect(mocks.sign).not.toHaveBeenCalled();
  mocks.query.mockResolvedValue({
    rows: [
      {
        status: 'completed',
        output_object_key: 'output',
        expires_at: '2099-01-01',
        filename: 'video.mp4',
      },
    ],
  });
  mocks.sign.mockResolvedValue('signed');
  expect(await jobAction(id, 'download', 'GET', 'owner')).toEqual({
    url: 'signed',
    expires_in: 60,
  });
});
it('denies exhausted quotas before allocating a job', async () => {
  mocks.query
    .mockResolvedValueOnce({ rowCount: 1 })
    .mockResolvedValueOnce({ rowCount: 0 });
  await expect(
    createUpload(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ filename: 'video.mp4', size: 20 }),
      }),
      'owner',
    ),
  ).rejects.toThrow('daily video allowance');
  expect(mocks.query).toHaveBeenCalledTimes(2);
});
it('rejects traversal filenames and oversized uploads', async () => {
  for (const data of [
    { filename: '../video.mp4', size: 20 },
    { filename: 'video.mp4', size: 1_500_000_001 },
  ])
    await expect(
      createUpload(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
        'owner',
      ),
    ).rejects.toThrow();
  expect(mocks.query).not.toHaveBeenCalled();
});
