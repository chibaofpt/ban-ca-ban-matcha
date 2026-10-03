/** Returns the inclusive/exclusive UTC bounds for the current Vietnam calendar year. */
export function vietnamYearBounds(now: Date): { year: number; start: Date; end: Date } {
  const vietnam = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = vietnam.getUTCFullYear();
  return {
    year,
    start: new Date(Date.UTC(year - 1, 11, 31, 17)),
    end: new Date(Date.UTC(year, 11, 31, 17)),
  };
}

/** Projects voucher expiry for a read without mutating persisted lifecycle state. */
export function effectiveAdminVoucherStatus(status: string, expiresAt: Date | null, now: Date): string {
  return status === "ACTIVE" && expiresAt && expiresAt <= now ? "EXPIRED" : status;
}

/** Returns calendar-day countdown rounded up, or null when no expiry exists. */
export function adminVoucherDaysRemaining(expiresAt: Date | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));
}
