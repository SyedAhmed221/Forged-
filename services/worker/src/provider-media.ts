import { execFile } from 'node:child_process';
import { open, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import { inspectMedia } from './media';

const exec = promisify(execFile);
const padding = Buffer.from('0000000400000000', 'hex');

export function decodedFrameCount(value: unknown) {
  // Grouped files repeat streams in stream_groups. Count the top-level stream.
  return z
    .object({
      streams: z
        .array(z.object({ nb_read_frames: z.coerce.number().int().positive() }))
        .length(1),
    })
    .parse(value).streams[0].nb_read_frames;
}

// TikQuick v23 references the same empty H.264 NAL repeatedly at the end of
// its sample table. These are patch instructions, not additional video frames.
// Recognize only that exact pattern; arbitrary decode errors still fail closed.
export function paddingSuffix(packets: string) {
  let real = 0;
  let count = 0;
  let position: number | undefined;
  for (const line of packets.trim().split(/\r?\n/)) {
    const fields = Object.fromEntries(line.split('|').map((v) => v.split('=')));
    const size = Number(fields.size);
    const pos = Number(fields.pos);
    if (
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      !Number.isSafeInteger(pos) ||
      pos < 0
    )
      return;
    if (size === 8) {
      if (position !== undefined && position !== pos) return;
      position = pos;
      count++;
    } else {
      if (count) return;
      real++;
    }
  }
  return real && count && position !== undefined
    ? { real, count, position }
    : undefined;
}

export async function inspectProviderMedia(path: string, signal: AbortSignal) {
  try {
    return await inspectMedia(path, signal, true);
  } catch (error) {
    signal.throwIfAborted();
    if (!(error instanceof AppError) || error.code !== 'INVALID_MEDIA')
      throw error;
    const metadata = await inspectMedia(path, signal);
    if (
      metadata.streams.find((s) => s.codec_type === 'video')?.codec_name !==
      'h264'
    )
      throw error;
    const table = await exec(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-select_streams',
        'v:0',
        '-show_packets',
        '-show_entries',
        'packet=size,pos',
        '-of',
        'compact=p=0',
        path,
      ],
      { signal, timeout: 60000, maxBuffer: 64 * 1024 * 1024 },
    );
    const suffix = paddingSuffix(table.stdout);
    if (!suffix) throw error;
    const file = await open(path, 'r');
    try {
      const bytes = Buffer.alloc(8);
      const read = await file.read(bytes, 0, 8, suffix.position);
      if (read.bytesRead !== 8 || !bytes.equals(padding)) throw error;
    } finally {
      await file.close();
    }
    const validationPath = `${path}.validation.mp4`;
    try {
      // Stream copy into a disposable validation file. The downloadable provider
      // artifact is never rewritten, remuxed, or re-encoded.
      await exec(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          path,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-c',
          'copy',
          '-bsf:v',
          'noise=drop=eq(size\\,8)',
          validationPath,
        ],
        { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 },
      );
      await inspectMedia(validationPath, signal, true);
      const frames = await exec(
        process.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-select_streams',
          'v:0',
          '-count_frames',
          '-show_entries',
          'stream=nb_read_frames',
          '-of',
          'json',
          validationPath,
        ],
        { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 },
      );
      if (decodedFrameCount(JSON.parse(frames.stdout)) !== suffix.real)
        throw error;
      return {
        ...metadata,
        validation: 'tikquick_content' as const,
        padding_samples: suffix.count,
      };
    } finally {
      await rm(validationPath, { force: true });
    }
  }
}
