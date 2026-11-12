import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { AppError, type MediaMetadata } from '@tikquick/shared';
const exec = promisify(execFile);
export async function compressToLimit(
  source: string,
  output: string,
  duration: number,
  limit: number,
  signal: AbortSignal,
) {
  let bitrate = Math.floor((limit * 0.92 * 8) / duration - 128000);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (bitrate < 10000)
      throw new AppError(
        'ENCODING_LIMIT',
        'This video is too long to compress within 300 MB. Please export a shorter video.',
      );
    await exec(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-b:v',
        String(bitrate),
        '-maxrate',
        String(bitrate),
        '-bufsize',
        String(bitrate * 2),
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        output,
      ],
      { signal, timeout: 45 * 60 * 1000, maxBuffer: 1024 * 1024 },
    );
    const size = (await stat(output)).size;
    if (size <= limit) return size;
    bitrate = Math.floor(((bitrate * limit) / size) * 0.85);
  }
  throw new AppError(
    'ENCODING_LIMIT',
    'The video could not be compressed within 300 MB. Please export a smaller file.',
  );
}
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
      channels: z.number().int().positive().optional(),
      avg_frame_rate: z.string().optional(),
      r_frame_rate: z.string().optional(),
    }),
  ),
});
export function validateProbe(
  value: unknown,
  providerHeader = false,
): MediaMetadata {
  if (providerHeader && value && typeof value === 'object') {
    const raw = value as {
      format?: { duration?: unknown };
      streams?: {
        codec_type?: string;
        codec_name?: string;
        duration?: unknown;
      }[];
    };
    const duration = Number(raw.format?.duration);
    const video = raw.streams?.find((s) => s.codec_type === 'video');
    const trackDuration = Number(video?.duration);
    if (
      duration < 0 &&
      duration >= -0.001 &&
      video?.codec_name === 'h264' &&
      Number.isFinite(trackDuration) &&
      trackDuration > 0
    ) {
      value = { ...raw, format: { ...raw.format, duration: trackDuration } };
    }
  }
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
  providerHeader = false,
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
    const metadata = validateProbe(JSON.parse(result.stdout), providerHeader);
    if (fullDecode) {
      const decode = (audioFilters: string[] = []) =>
        exec(
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
            ...audioFilters,
            '-f',
            'null',
            '-',
          ],
          { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 },
        );
      try {
        await decode();
      } catch (error) {
        signal.throwIfAborted();
        const stderr = (error as { stderr?: string }).stderr ?? '';
        const filters = metadata.streams
          .filter((stream) => stream.codec_type === 'audio')
          .flatMap((stream, index) =>
            stream.channels === 2
              ? [
                  `-filter:a:${index}`,
                  'channelmap=map=0|1:channel_layout=stereo',
                ]
              : [],
          );
        // Some patched AAC streams decode to side-left and side-right. Map both
        // channels for the null sink only, then require a complete strict decode.
        if (
          !providerHeader ||
          !stderr.includes(
            "Input channel layout '2 channels (SL+SR)' is not supported",
          ) ||
          !filters.length
        )
          throw error;
        await decode(filters);
      }
    }
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
