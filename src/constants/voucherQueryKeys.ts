import type { AdminVoucherExchangePeriod } from "@/contracts/admin/voucher";

export const VOUCHER_QUERY_KEYS = {
  CUSTOMER_VOUCHERS: ["customer", "vouchers"],
  CUSTOMER_VOUCHER_HISTORY: ["customer", "vouchers", "history"],
  VOUCHER_PACKAGES: ["voucher_packages"],
  ADMIN_VOUCHER_PACKAGES: ["admin", "voucher-packages"],
  ADMIN_VOUCHER_EXCHANGE_RANKING: (period: AdminVoucherExchangePeriod) =>
    ["admin", "voucher-packages", "exchange-ranking", period],
  ADMIN_VOUCHER_RECIPIENT: (packageId: string, userQrToken: string, status: string, cursor?: string) =>
    cursor === undefined
      ? ["admin", "voucher-packages", packageId, "recipients", userQrToken, status]
      : ["admin", "voucher-packages", packageId, "recipients", userQrToken, status, cursor],
  STAFF_CUSTOMER_CATALOG: (customerQrToken: string | null) => ["staff", "voucher-packages", customerQrToken],
  CUSTOMER_POINTS: ["customer", "points"],
} as const;
