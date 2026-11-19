import { z } from 'zod';
import { AppError } from '@tikquick/shared';
import { packAvailable, packById } from '../../../../lib/packs/catalog';
import {
  packRateLimit,
  packsPost,
  readPackJson,
} from '../../../../lib/packs/http';
import {
  applyPackPromo,
  findPackPromo,
  formatPackMoney,
} from '../../../../lib/packs/promo';

export const POST = packsPost(async (request) => {
  const { productId, promoCode } = z
    .strictObject({
      productId: z.string().min(1).max(80),
      promoCode: z.string().trim().min(1).max(40),
    })
    .parse(await readPackJson(request, 2048));
  if (process.env.PACKS_DATABASE_URL) {
    await packRateLimit(request, 'promo', 20);
  }
  const pack = packById(productId);
  if (
    !pack ||
    !Number.isSafeInteger(pack.priceMinor) ||
    pack.priceMinor <= 0 ||
    !packAvailable(pack)
  )
    throw new AppError('NOT_FOUND', 'This pack is unavailable.', 404);
  const promo = findPackPromo(promoCode);
  if (!promo)
    throw new AppError(
      'INVALID_PROMO',
      'That discount code is not valid.',
      400,
    );
  const pricing = applyPackPromo(pack.priceMinor, promo);
  return {
    code: promo.code,
    percentOff: promo.percentOff,
    currency: pack.currency,
    originalMinor: pricing.originalMinor,
    discountMinor: pricing.discountMinor,
    finalMinor: pricing.finalMinor,
    originalFormatted: formatPackMoney(pricing.originalMinor, pack.currency),
    discountFormatted: formatPackMoney(pricing.discountMinor, pack.currency),
    finalFormatted: formatPackMoney(pricing.finalMinor, pack.currency),
  };
});
