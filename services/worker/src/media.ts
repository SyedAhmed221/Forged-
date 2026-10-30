import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { AppError, type MediaMetadata } from '@tikquick/shared';
const exec = promisify(execFile);
const probeSchema = z.object({
  format: z.object({
    format_name: z.string(),
    duration: z.coerce.number().positive(),
  }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      sample_rate: z.string().optional(),
    }),
  ),
});
export function validateProbe(value: unknown): MediaMetadata {
  const parsed = probeSchema.safeParse(value);
  if (
    !parsed.success ||
    !parsed.data.format.format_name
      .split(',')
      .some((v) => ['mov', 'mp4'].includes(v)) ||
    !parsed.data.streams.some(
      (s) =>
        s.codec_type === 'video' && (s.width || 0) > 0 && (s.height || 0) > 0,
    )
  )
    throw new AppError(
      'INVALID_MEDIA',
      'The file is not a valid MP4 or MOV video.',
    );
  return {
    duration: parsed.data.format.duration,
    format: parsed.data.format.format_name,
    streams: parsed.data.streams,
  };
}
export async function inspectMedia(
  path: string,
  signal: AbortSignal,
  fullDecode = false,
) {
  try {
    const result = await exec(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        path,
      ],
      { signal, timeout: 60000, maxBuffer: 1024 * 1024 },
    );
    const metadata = validateProbe(JSON.parse(result.stdout));
    if (fullDecode)
      await exec(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-v',
          'error',
          '-xerror',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          path,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-f',
          'null',
          '-',
        ],
        { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 },
      );
    return metadata;
  } catch (e) {
    signal.throwIfAborted();
    if (e instanceof AppError) throw e;
    throw new AppError(
      'INVALID_MEDIA',
      'Media validation failed. The file must contain a playable video.',
    );
  }
}
