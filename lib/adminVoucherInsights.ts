import type { VoucherStatus } from "@prisma/client";

export type EffectiveVoucherStatus = VoucherStatus;
type VoucherSnapshot = { status: VoucherStatus; expires_at: Date | null };
export type VoucherStatusAggregate = { package_id: string; status: VoucherStatus; _count: { _all: number } };
export type VoucherExpiredAggregate = { package_id: string; _count: { _all: number } };

export interface AdminVoucherStats {
  issued_count: number;
  active_count: number;
  reserved_count: number;
  redeemed_count: number;
  expired_count: number;
  refunded_count: number;
  remaining_quantity: number | null;
}

/** Resolves display expiry without mutating a voucher row. */
export function effectiveVoucherStatus(voucher: VoucherSnapshot, now = new Date()): EffectiveVoucherStatus {
  return voucher.status === "ACTIVE" && voucher.expires_at !== null && voucher.expires_at <= now
    ? "EXPIRED"
    : voucher.status;
}

/** Builds package operational counts from current voucher rows. */
export function buildAdminVoucherStats(
  pkg: { id: string; quantity: number | null; issued_count: number },
  statusAggregates: VoucherStatusAggregate[],
  expiredActiveAggregates: VoucherExpiredAggregate[],
): AdminVoucherStats {
  const counts: Record<VoucherStatus, number> = { ACTIVE: 0, RESERVED: 0, REDEEMED: 0, EXPIRED: 0, REFUNDED: 0 };
  for (const row of statusAggregates) if (row.package_id === pkg.id) counts[row.status] = row._count._all;
  const expiredActive = expiredActiveAggregates.find((row) => row.package_id === pkg.id)?._count._all ?? 0;
  counts.ACTIVE = Math.max(counts.ACTIVE - expiredActive, 0);
  counts.EXPIRED += expiredActive;
  return {
    issued_count: pkg.issued_count,
    active_count: counts.ACTIVE,
    reserved_count: counts.RESERVED,
    redeemed_count: counts.REDEEMED,
    expired_count: counts.EXPIRED,
    refunded_count: counts.REFUNDED,
    remaining_quantity: pkg.quantity === null ? null : Math.max(pkg.quantity - pkg.issued_count, 0),
  };
}
