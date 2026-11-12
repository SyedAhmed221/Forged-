import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import { endpoint } from '../../../lib/server';
import { analyzeTikTok, parseTikTokLink } from '../../../lib/tiktok-analytics';

export const runtime = 'nodejs';

const requestBody = z.object({ url: z.string().trim().max(2048) });

export const POST = endpoint(async (request) => {
  const body = requestBody.safeParse(await request.json().catch(() => null));
  if (!body.success)
    throw new AppError('INVALID_REQUEST', 'Enter a valid TikTok video link.');

  const result = await analyzeTikTok(parseTikTokLink(body.data.url));
  if (!result)
    throw new AppError(
      'TIKTOK_POST_UNAVAILABLE',
      'TikTok did not return public details for this post. Check the link or try a different public video.',
      404,
    );
  return result;
});
