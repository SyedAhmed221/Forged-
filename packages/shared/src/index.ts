import { z } from 'zod';
export const MAX_INPUT_BYTES = 70_000_000;
export const ENCODER_MAX_BYTES = 1_500_000_000;
export const statuses = [
  'uploading',
  'uploaded',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'deleting',
] as const;
export type JobStatus = (typeof statuses)[number];
export type MediaMetadata = {
  validation?: 'tikquick_content';
  padding_samples?: number;
  duration: number;
  format: string;
  streams: {
    codec_type: string;
    codec_name?: string;
    width?: number;
    height?: number;
    sample_rate?: string;
    avg_frame_rate?: string;
    r_frame_rate?: string;
  }[];
};
export type Job = {
  id: string;
  filename: string;
  status: JobStatus;
  input_size_bytes: number;
  output_size_bytes: number | null;
  input_metadata: MediaMetadata | null;
  output_metadata: MediaMetadata | null;
  use_encoder: boolean;
  provider_stage: string | null;
  progress: {
    uploaded_bytes?: number;
    total_bytes?: number;
    received_bytes?: number;
    encoder_percent?: number;
    encoder_event?: string;
  };
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  cancel_requested: boolean;
};
export const uploadSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(180)
    .regex(/^[^/\\\x00-\x1f]+\.(mp4|mov)$/i, 'Choose an MP4 or MOV file'),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  use_encoder: z.boolean().default(false),
});
export const idSchema = z.uuid();
export const stages: Record<string, string> = {
  uploading: 'Uploading to secure storage',
  uploaded: 'Ready to start',
  queued: 'Waiting for a worker',
  preparing: 'Preparing video',
  connecting: 'Connecting to patcher',
  sending: 'Sending video for optimization',
  encoding: 'Preparing video with encoder',
  patching: 'Patching video',
  receiving: 'Receiving output',
  verifying: 'Verifying output',
  completed: 'Ready to download',
};
export function byteRanges(size: number, chunkBytes: number, firstIndex = 0) {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    !Number.isSafeInteger(chunkBytes) ||
    chunkBytes <= 0
  )
    throw new Error('Invalid byte range');
  return Array.from({ length: Math.ceil(size / chunkBytes) }, (_, n) => ({
    index: n + firstIndex,
    start: n * chunkBytes,
    end: Math.min((n + 1) * chunkBytes, size),
  }));
}
export function formatBytes(value: number) {
  return value < 1048576
    ? `${(value / 1024).toFixed(0)} KB`
    : `${(value / 1048576).toFixed(1)} MB`;
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function recoveryDecision(
  completionStarted: boolean,
  attempts: number,
  maxAttempts = 3,
) {
  return completionStarted
    ? 'ambiguous'
    : attempts >= maxAttempts
      ? 'failed'
      : 'restart';
}
