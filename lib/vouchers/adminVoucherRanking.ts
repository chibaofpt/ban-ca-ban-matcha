import type {
  AdminVoucherExchangePeriod,
  AdminVoucherExchangeRanking,
  AdminVoucherExchangeRankingItem,
} from "@/contracts/admin/voucher";

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface VoucherExchangeAggregate {
  package_id: string;
  _count: { _all: number };
}

export interface VoucherExchangePackageRow {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface AdminVoucherExchangeRankingDatabase {
  voucher: { groupBy: (args: unknown) => Promise<VoucherExchangeAggregate[]> };
  voucherPackage: { findMany: (args: unknown) => Promise<VoucherExchangePackageRow[]> };
}

/** Vietnam-calendar UTC bounds (inclusive/exclusive) for one admin ranking period. */
export function voucherExchangePeriodBounds(
  period: AdminVoucherExchangePeriod,
  now: Date,
): { from: Date; to: Date } {
  const vietnam = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const year = vietnam.getUTCFullYear();
  const month = vietnam.getUTCMonth();
  const day = vietnam.getUTCDate();
  if (period === "year") {
    return {
      from: new Date(Date.UTC(year, 0, 1) - VIETNAM_OFFSET_MS),
      to: new Date(Date.UTC(year + 1, 0, 1) - VIETNAM_OFFSET_MS),
    };
  }
  if (period === "month") {
    return {
      from: new Date(Date.UTC(year, month, 1) - VIETNAM_OFFSET_MS),
      to: new Date(Date.UTC(year, month + 1, 1) - VIETNAM_OFFSET_MS),
    };
  }
  if (period === "day") {
    const from = new Date(Date.UTC(year, month, day) - VIETNAM_OFFSET_MS);
    return { from, to: new Date(from.getTime() + DAY_MS) };
  }
  // Monday-first Vietnam week: 0 = Monday … 6 = Sunday.
  const mondayIndex = (vietnam.getUTCDay() + 6) % 7;
  const from = new Date(Date.UTC(year, month, day - mondayIndex) - VIETNAM_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 7 * DAY_MS) };
}

/** Count POINTS_EXCHANGE vouchers per package inside one Vietnam period, ranked high to low. */
export async function readVoucherExchangeRanking(
  db: AdminVoucherExchangeRankingDatabase,
  period: AdminVoucherExchangePeriod,
  now: Date,
): Promise<AdminVoucherExchangeRanking> {
  const { from, to } = voucherExchangePeriodBounds(period, now);
  const aggregates = await db.voucher.groupBy({
    by: ["package_id"],
    where: { issued_via: "POINTS_EXCHANGE", created_at: { gte: from, lt: to } },
    _count: { _all: true },
  });
  const counts = new Map(aggregates.map((row) => [row.package_id, row._count._all]));
  const packages = counts.size === 0
    ? []
    : await db.voucherPackage.findMany({
        where: { id: { in: [...counts.keys()] } },
        select: { id: true, name: true, description: true, created_at: true },
      });
  const ranked = packages
    .map((pkg) => ({ ...pkg, exchange_count: counts.get(pkg.id) ?? 0 }))
    .filter((row) => row.exchange_count > 0)
    .sort((a, b) =>
      b.exchange_count - a.exchange_count ||
      b.created_at.getTime() - a.created_at.getTime() ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const items: AdminVoucherExchangeRankingItem[] = ranked.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    exchange_count: row.exchange_count,
  }));
  return { period, from: from.toISOString(), to: to.toISOString(), items };
}
