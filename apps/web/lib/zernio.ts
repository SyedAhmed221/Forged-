import { z } from 'zod';
import { AppError } from '@tikquick/shared';

export const keySchema = z.string().trim().min(12).max(512);
export const accountSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
const base = 'https://zernio.com/api';

export async function zernio<T>(
  key: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
    redirect: 'error',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        'ZERNIO_AUTH',
        'Check your Zernio API key and its permissions.',
        401,
      );
    throw new AppError(
      'ZERNIO_ERROR',
      'Zernio could not complete this request. Try again later.',
      502,
    );
  }
  return body as T;
}

export type ZernioAccount = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  isActive?: boolean;
};
export async function tiktokAccounts(key: string) {
  const response = await zernio<{ accounts: ZernioAccount[] }>(
    key,
    '/v1/accounts',
  );
  return response.accounts
    .filter((a) => a.platform === 'tiktok' && a.isActive !== false)
    .map((a) => ({
      id: a._id,
      username: a.username || a.displayName || 'TikTok account',
    }));
}

export async function creatorInfo(key: string, accountId: string) {
  const accounts = await tiktokAccounts(key);
  if (!accounts.some((a) => a.id === accountId))
    throw new AppError(
      'ACCOUNT_NOT_FOUND',
      'Connect this TikTok account in Zernio first.',
      404,
    );
  const result = await zernio<{
    creator?: { canPostMore?: boolean };
    privacyLevels: { value: string; label: string }[];
    postingLimits?: {
      maxVideoDurationSec?: number;
      interactionSettings?: Record<string, { enabled?: boolean }>;
    };
  }>(
    key,
    `/v1/accounts/${encodeURIComponent(accountId)}/tiktok/creator-info?mediaType=video`,
  );
  return {
    account: accounts.find((a) => a.id === accountId)!,
    privacyLevels: result.privacyLevels,
    canPost: result.creator?.canPostMore !== false,
    maxDuration: result.postingLimits?.maxVideoDurationSec,
    interactions: result.postingLimits?.interactionSettings || {},
  };
}

export function approvedMediaUrl(value: string, host: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== host ||
    url.username ||
    url.password ||
    url.port
  )
    throw new AppError(
      'ZERNIO_MEDIA',
      'Zernio returned an unexpected media address.',
      502,
    );
  return url.toString();
}
