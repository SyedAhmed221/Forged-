import { stat, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { TikQuick } from '../services/worker/src/providers/tikquick';
import { inspectMedia } from '../services/worker/src/media';
// Explicitly opt-in: this sends the sample video to TikQuick and may incur provider usage.
if (
  process.env.LIVE_TIKQUICK_TEST !== 'true' ||
  !process.env.LIVE_SAMPLE_PATH ||
  !process.env.TIKQUICK_API_KEY
)
  throw new Error(
    'Set LIVE_TIKQUICK_TEST=true, LIVE_SAMPLE_PATH, and TIKQUICK_API_KEY in your private .env to authorize a live test.',
  );
const path = resolve(process.env.LIVE_SAMPLE_PATH);
const size = (await stat(path)).size;
if (size > 10 * 1024 * 1024)
  throw new Error('Use a sample smaller than 10 MiB.');
const signal = AbortSignal.timeout(30 * 60 * 1000);
await inspectMedia(path, signal);
const provider = new TikQuick({ key: process.env.TIKQUICK_API_KEY });
const hooks = {
  signal,
  progress: async (p: { stage: string }) => {
    console.log(JSON.stringify({ stage: p.stage }));
  },
  beforeComplete: async () => {
    console.log('Completion starting; this operation will not be retried.');
  },
};
const source = { path, size, filename: 'sample.mp4' };
const response =
  process.env.LIVE_USE_ENCODER === 'true'
    ? await provider.encoded(source, hooks)
    : await provider.standard(source, hooks);
await mkdir('artifacts', { recursive: true });
const output = resolve(join('artifacts', `live-${Date.now()}.mp4`));
await pipeline(
  Readable.fromWeb(
    response.body! as import('node:stream/web').ReadableStream<Uint8Array>,
  ),
  createWriteStream(output),
  { signal },
);
const metadata = await inspectMedia(output, signal, true);
console.log(
  JSON.stringify({ result: 'validated', output, duration: metadata.duration }),
);
