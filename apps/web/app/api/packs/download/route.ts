import { AppError } from '@tikquick/shared';
import { z } from 'zod';
import {
  packsPost,
  packRateLimit,
  readPackJson,
} from '../../../../lib/packs/http';
import {
  downloadLimit,
  signPack,
  signingSecret,
} from '../../../../lib/packs/delivery';
import { orderIdSchema, validOrderToken } from '../../../../lib/packs/security';
import { packTransaction, type PackOrder } from '../../../../lib/packs/store';

export const POST = packsPost(async (request) => {
  const { id, token } = z
    .strictObject({ id: orderIdSchema, token: z.string().max(60) })
    .parse(await readPackJson(request, 2048));
  await packRateLimit(request, 'download', 20);
  if (!validOrderToken(signingSecret(), 'download', id, token))
    throw new AppError(
      'DOWNLOAD_UNAVAILABLE',
      'The download link is invalid or has expired.',
      404,
    );
  return packTransaction(async (db) => {
    const order = (
      await db.query<PackOrder>(
        `update forge_packs.orders set download_count=download_count+1
       where id=$1 and status='paid' and expires_at>now() and download_count<$2 returning *`,
        [id, downloadLimit()],
      )
    ).rows[0];
    if (!order)
      throw new AppError(
        'DOWNLOAD_UNAVAILABLE',
        'The download link has expired, been revoked, or reached its limit.',
        410,
      );
    return { url: await signPack(order) };
  });
});
