export const PLANS = {
  free: {
    name: 'Free',
    priceUsdt: 0,
    features: ['Top 10 traders', 'Basic profiles', '10 markets', 'Read Wiki'],
  },
  pro: {
    name: 'Pro',
    priceUsdt: 4.99,
    features: ['Unlimited traders', 'Full position history', 'Wiki editing', '10 alerts', 'Portfolio tracking'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
