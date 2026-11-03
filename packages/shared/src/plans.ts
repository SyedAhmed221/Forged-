export const premiumPlans = {
  monthly: { label: '1 month', amount: 900, months: 1 },
  quarterly: { label: '3 months', amount: 2400, months: 3 },
  halfYearly: { label: '6 months', amount: 4600, months: 6 },
  yearly: { label: '1 year', amount: 8000, months: 12 },
} as const;

export type PremiumPlan = keyof typeof premiumPlans;

export function limitsFor(premium: boolean) {
  return premium
    ? {
        tier: 'premium' as const,
        daily: null,
        bytes: 300_000_000,
        shortEdge: 2160,
        longEdge: 3840,
        fps: 120,
      }
    : {
        tier: 'free' as const,
        daily: 1,
        bytes: 70_000_000,
        shortEdge: 1080,
        longEdge: 1920,
        fps: 60,
      };
}
