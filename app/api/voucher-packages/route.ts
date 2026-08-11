/**
 * GET /api/voucher-packages — Public route, no auth required.
 * Returns all VoucherPackage rows with is_active = true,
 * ordered by created_at asc (oldest first for stable listing).
 *
 * Caching: base package list cached in Redis (TTL 5 min).
 * User-specific redeemed counts are always fetched live and merged client-side.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";

export async function GET() {
  try {
    // Cache the base package list (no user-specific data)
    const cachedPackages = await withCache(
      CACHE_KEYS.VOUCHER_PACKAGES,
      CACHE_TTL.VOUCHER_PACKAGES,
      fetchVoucherPackages,
    );
    // Campaign windows and activation are live state; never put BUNDLE packages in app cache.
    const bundlePackages = await fetchActiveBundlePackages(new Date());
    const packages = [...cachedPackages, ...bundlePackages].sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );

    const session = await getSession();

    if (!session) {
      return NextResponse.json({
        data: packages.map((pkg) => ({ ...pkg, user_redeemed_count: 0 })),
      });
    }

    // User-specific redeemed counts — always live (never cached)
    const packageIds = packages.map((p) => p.id);
    const redeemedCounts = await prisma.voucher.groupBy({
      by: ["package_id"],
      where: {
        package_id: { in: packageIds },
        user_id: session.id,
      },
      _count: { id: true },
    });

    const countMap = Object.fromEntries(
      redeemedCounts.map((rc) => [rc.package_id, rc._count.id])
    );

    const enrichedPackages = packages.map((pkg) => ({
      ...pkg,
      user_redeemed_count: countMap[pkg.id] ?? 0,
    }));

    return NextResponse.json({ data: enrichedPackages });
  } catch (err) {
    console.error("[GET /api/voucher-packages]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/** Fetches active voucher packages from DB. Called by withCache on cache miss. */
async function fetchVoucherPackages() {
  return prisma.voucherPackage.findMany({
    where: { is_active: true, voucher_type: { not: "BUNDLE" } },
    orderBy: { created_at: "asc" },
    include: {
      menuItem: { select: { name: true, is_available: true } },
      addonOption: { select: { label: true } },
    },
  });
}

/** Fetch active BUNDLE packages live so campaign windows are never stale in Redis. */
async function fetchActiveBundlePackages(now: Date) {
  return prisma.voucherPackage.findMany({
    where: {
      is_active: true,
      voucher_type: "BUNDLE",
      promotion: {
        is_active: true,
        published_at: { not: null },
        starts_at: { lte: now },
        ends_at: { gt: now },
      },
    },
    orderBy: { created_at: "asc" },
    include: {
      menuItem: { select: { name: true, is_available: true } },
      addonOption: { select: { label: true } },
    },
  });
}

