export const ADMIN_REWARD_QUERY_KEYS = {
  SETTINGS: ["admin", "welcome-reward-settings"],
  CAMPAIGNS: ["admin", "reward-campaigns"],
  CAMPAIGN: (id: string) => ["admin", "reward-campaigns", id] as const,
  VOUCHER_PACKAGES: ["admin", "voucher-packages"],
} as const;
