import { z } from 'zod';
import {
  packsPost,
  packRateLimit,
  readPackJson,
} from '../../../../lib/packs/http';
import { sendReceipt } from '../../../../lib/packs/delivery';
import { orderIdSchema } from '../../../../lib/packs/security';
import { packDb, type PackOrder } from '../../../../lib/packs/store';

export const POST = packsPost(async (request) => {
  const { email, id } = z
    .strictObject({ id: orderIdSchema, email: z.email().max(254) })
    .parse(await readPackJson(request, 2048));
  await packRateLimit(request, 'resend', 5);
  await packRateLimit(request, 'resend-order', 1, id);
  const order = (
    await packDb().query<PackOrder>(
      "select * from forge_packs.orders where id=$1 and buyer_email=$2 and status='paid' and expires_at>now()",
      [id, email.toLowerCase()],
    )
  ).rows[0];
  if (order)
    await sendReceipt(
      order,
      `forge-packs-resend-${id}-${Math.floor(Date.now() / 60000)}`,
    ).catch(() => {});
  return { accepted: true };
});
