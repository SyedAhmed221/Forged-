import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectMedia } from '../services/worker/src/media';
import {
  inspectProviderMedia,
  paddingSuffix,
  decodedFrameCount,
} from '../services/worker/src/provider-media';

it('counts selected frames once for grouped and ordinary media', () => {
  expect(
    decodedFrameCount({
      stream_groups: [{ streams: [{ nb_read_frames: '1264' }] }],
      streams: [{ nb_read_frames: '1264' }],
    }),
  ).toBe(1264);
  expect(decodedFrameCount({ streams: [{ nb_read_frames: '192' }] })).toBe(192);
  for (const streams of [
    [],
    [{ nb_read_frames: 'N/A' }],
    [{ nb_read_frames: 0 }],
    [{ nb_read_frames: 2 }, { nb_read_frames: 2 }],
  ])
    expect(() => decodedFrameCount({ streams })).toThrow();
});

it('recognizes only a trailing repeated eight-byte sample reference', () => {
  expect(
    paddingSuffix('size=200|pos=100\nsize=8|pos=300\nsize=8|pos=300'),
  ).toEqual({ real: 1, count: 2, position: 300 });
  for (const table of [
    '',
    'size=8|pos=300',
    'size=200|pos=100',
    'size=200|pos=100\nsize=8|pos=300\nsize=8|pos=308',
    'size=200|pos=100\nsize=8|pos=300\nsize=200|pos=400',
    'size=200|pos=100\nsize=8|pos=N/A',
  ])
    expect(paddingSuffix(table)).toBeUndefined();
});

// Enable real decoder regression checks with the worker's configured tools.
const mediaTest = it.skipIf(
  !process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH,
);
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forged-media-test-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

mediaTest(
  'validates real content while preserving the provider artifact byte for byte',
  async () => {
    const bytes = await readFile('tests/fixtures/tikquick-v23.mp4');
    const path = join(dir, 'patched.mp4');
    await writeFile(path, bytes);
    await expect(
      inspectMedia(path, AbortSignal.timeout(60000), true),
    ).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
    await expect(
      inspectProviderMedia(path, AbortSignal.timeout(60000)),
    ).resolves.toMatchObject({
      validation: 'tikquick_content',
      padding_samples: 57,
    });
    expect(await readFile(path)).toEqual(bytes);
    await expect(access(`${path}.validation.mp4`)).rejects.toThrow();
  },
);

mediaTest(
  'rejects unexpected padding bytes and corrupt real frames',
  async () => {
    const original = await readFile('tests/fixtures/tikquick-v23.mp4');
    const badPadding = Buffer.from(original);
    badPadding[badPadding.length - 1] = 1;
    const badFrames = Buffer.from(original);
    const start = badFrames.indexOf(Buffer.from('mdat')) + 4;
    expect(start).toBeGreaterThan(4);
    badFrames.fill(0, start, start + 300);
    for (const [name, bytes] of [
      ['padding', badPadding],
      ['frames', badFrames],
    ] as const) {
      const path = join(dir, `${name}.mp4`);
      await writeFile(path, bytes);
      await expect(
        inspectProviderMedia(path, AbortSignal.timeout(60000)),
      ).rejects.toThrow();
    }
  },
);
