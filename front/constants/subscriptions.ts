export const SUBSCRIPTION_LEVELS : Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PLUS: 2,
} as const;

export const SUBSCRIPTION_INFO = {
  [SUBSCRIPTION_LEVELS.FREE]: {
    name: "Free",
    price: "$0/month",
    description: "Access to all models",
    dailyLimit: "~3K tokens per day*",
  },
  [SUBSCRIPTION_LEVELS.BASIC]: {
    name: "Basic",
    price: "$1/month",
    description: "Access to all models",
    dailyLimit: "~312K tokens per day*",
  },
  [SUBSCRIPTION_LEVELS.PLUS]: {
    name: "Plus",
    price: "$5/month",
    description: "Access to all models",
    dailyLimit: "~1.67M tokens per day*",
  },
} as const;

export const subscriptionNames = {
  0: "Free",
  [SUBSCRIPTION_LEVELS.BASIC]: SUBSCRIPTION_INFO[SUBSCRIPTION_LEVELS.BASIC].name,
  [SUBSCRIPTION_LEVELS.PLUS]: SUBSCRIPTION_INFO[SUBSCRIPTION_LEVELS.PLUS].name,
} as const;
