import type { Pack } from './catalog';

export type PackPromoCode = {
  readonly code: string;
  readonly percentOff: number;
  readonly expiresAt?: number;
};

/**
 * Active promo codes for Forge Quality Packs only (not the optimizer/subscription).
 * Codes are matched case-insensitively after trimming whitespace.
 */
const PACK_PROMO_CODES: readonly PackPromoCode[] = [
  { code: 'siv', percentOff: 10 },
  { code: 'blazedd', percentOff: 10 },
  { code: 'zoomstah', percentOff: 10 },
  { code: 'popeyez', percentOff: 10 },
  { code: 'dustinmyrq', percentOff: 10 },
  {
    code: 'blackfri10',
    percentOff: 10,
    expiresAt: Date.parse('2026-12-03T16:05:00Z'),
  },
];

export function normalizePromoCode(input: string) {
  return input.trim().toLowerCase();
}

export function findPackPromo(
  input: string | null | undefined,
): PackPromoCode | undefined {
  if (!input) return undefined;
  const normalized = normalizePromoCode(input);
  if (!normalized) return undefined;
  const now = Date.now();
  return PACK_PROMO_CODES.find(
    (entry) =>
      entry.code === normalized &&
      (entry.expiresAt === undefined || now < entry.expiresAt),
  );
}

export type PackPricing = {
  originalMinor: number;
  discountMinor: number;
  finalMinor: number;
  promo?: PackPromoCode;
};

export function applyPackPromo(
  priceMinor: number,
  promo?: PackPromoCode,
): PackPricing {
  if (!promo) {
    return {
      originalMinor: priceMinor,
      discountMinor: 0,
      finalMinor: priceMinor,
    };
  }
  const discountMinor = Math.round((priceMinor * promo.percentOff) / 100);
  const finalMinor = priceMinor - discountMinor;
  if (!Number.isSafeInteger(finalMinor) || finalMinor <= 0) {
    throw new Error('Calculated discounted price must be positive.');
  }
  return {
    originalMinor: priceMinor,
    discountMinor,
    finalMinor,
    promo,
  };
}

export function formatPackMoney(
  amountMinor: number,
  currency: Pack['currency'],
) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}
