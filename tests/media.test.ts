import { it, expect } from 'vitest';
import { validateProbe } from '../services/worker/src/media';
it('rejects non-video, zero duration, and incorrect containers', () => {
  for (const value of [
    {},
    {
      format: { format_name: 'mp4', duration: '0' },
      streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
    },
    {
      format: { format_name: 'mp3', duration: '10' },
      streams: [{ codec_type: 'audio' }],
    },
    {
      format: { format_name: 'mov,mp4', duration: '10' },
      streams: [{ codec_type: 'audio' }],
    },
  ])
    expect(() => validateProbe(value)).toThrow();
});
it('records video and audio tracks from FFprobe', () => {
  expect(
    validateProbe({
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.5' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000' },
      ],
    }),
  ).toMatchObject({
    duration: 12.5,
    streams: [{ codec_type: 'video', width: 1920 }, { codec_type: 'audio' }],
  });
});
