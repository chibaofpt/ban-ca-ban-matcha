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
import { toVoucherPackageBundleDto } from "@/lib/voucherBundleDto";
import {
  loadVoucherAvailabilityCatalog,
  resolveVoucherTargetAvailability,
  type VoucherAvailabilityDatabase,
  type VoucherBundleRuleSource,
} from "@/lib/voucherAvailability";

export async function GET() {
  try {
    // Cache the base package list (no user-specific data)
    const cachedPackages = await withCache(
      CACHE_KEYS.VOUCHER_PACKAGES,
      CACHE_TTL.VOUCHER_PACKAGES,
      fetchVoucherPackages,
    );
    // Campaign windows and activation are live state; never put BUNDLE packages in app cache.
    const scheduledPackages = await fetchScheduledVoucherPackages(new Date());
    const packages = [...cachedPackages, ...scheduledPackages].sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );

    const session = await getSession();

    let globalCountMap: Record<string, number> = {};
    const packageIds = packages.map((p) => p.id);

    if (packageIds.length > 0) {
      const globalRedeemedCounts = await prisma.voucher.groupBy({
        by: ["package_id"],
        where: { package_id: { in: packageIds } },
        _count: { id: true },
      });
      globalCountMap = Object.fromEntries(
        globalRedeemedCounts.map((rc) => [rc.package_id, rc._count.id])
      );
    }

    if (!session) {
      return NextResponse.json({
        data: packages.map((pkg) => {
          const issuedCount = globalCountMap[pkg.id] ?? 0;
          return {
            ...pkg,
            user_redeemed_count: 0,
            remaining_quantity: pkg.quantity === null ? null : Math.max(0, pkg.quantity - issuedCount),
          };
        }),
      });
    }

    let countMap: Record<string, number> = {};
    if (packageIds.length > 0) {
      const redeemedCounts = await prisma.voucher.groupBy({
        by: ["package_id"],
        where: {
          package_id: { in: packageIds },
          user_id: session.id,
        },
        _count: { id: true },
      });
      countMap = Object.fromEntries(
        redeemedCounts.map((rc) => [rc.package_id, rc._count.id])
      );
    }

    const enrichedPackages = packages.map((pkg) => {
      const issuedCount = globalCountMap[pkg.id] ?? 0;
      return {
        ...pkg,
        user_redeemed_count: countMap[pkg.id] ?? 0,
        remaining_quantity: pkg.quantity === null ? null : Math.max(0, pkg.quantity - issuedCount),
      };
    });

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
    where: { is_active: true, ends_at: null, voucher_type: { in: ["DISCOUNT", "FREESHIP"] } },
    orderBy: { created_at: "asc" },
    include: {
      menuItem: { select: { name: true, is_available: true } },
      menuItemScopes: { include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } } },
      addonOption: { select: { label: true } },
      bundleRule: { include: {
        productScopes: { include: {
          sizes: true,
          menuItem: { select: { name: true, category: true, is_available: true } },
        } },
        addonRewards: { include: { addonOption: { select: { label: true } } } },
      } },
    },
  }).then((packages) => packages.map(toVoucherPackageBundleDto));
}

/** Fetch active BUNDLE packages live so campaign windows are never stale in Redis. */
async function fetchScheduledVoucherPackages(now: Date) {
  const packages = await prisma.voucherPackage.findMany({
    where: {
      is_active: true,
      OR: [
        { ends_at: { gt: now } },
        { voucher_type: { in: ["ITEM", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "BUNDLE"] }, ends_at: null },
      ],
    },
    orderBy: { created_at: "asc" },
    include: {
      menuItem: { select: { name: true, is_available: true } },
      menuItemScopes: { include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } } },
      addonOption: { select: { label: true } },
      bundleRule: { include: {
        productScopes: { include: {
          sizes: true,
          menuItem: { select: { name: true, category: true, is_available: true } },
        } },
        addonRewards: { include: { addonOption: { select: { label: true } } } },
      } },
    },
  });
  const targetPackages = packages.filter((pkg) => ["ITEM", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "BUNDLE"].includes(pkg.voucher_type));
  const catalog = targetPackages.length > 0
    ? await loadVoucherAvailabilityCatalog(prisma as unknown as VoucherAvailabilityDatabase)
    : null;
  return packages.flatMap((pkg) => {
    if (!["ITEM", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "BUNDLE"].includes(pkg.voucher_type) || !catalog) {
      return [toVoucherPackageBundleDto(pkg)];
    }
    const resolved = resolveVoucherTargetAvailability({
      voucher_type: pkg.voucher_type,
      menu_item_id: pkg.menu_item_id,
      size: pkg.size,
      product_discount_mode: pkg.product_discount_mode,
      eligible_sizes: pkg.eligible_sizes,
      reference_size: pkg.reference_size,
      menuItemScopes: pkg.menuItemScopes,
      matcha_powder_id: pkg.matcha_powder_id,
      milk_type_id: pkg.milk_type_id,
      addon_option_id: pkg.addon_option_id,
      package: { bundleRule: pkg.bundleRule as unknown as VoucherBundleRuleSource | null },
    }, catalog);
    return resolved.availability.can_apply
      ? [toVoucherPackageBundleDto({ ...pkg, bundleRule: resolved.package.bundleRule ?? null } as typeof pkg)]
      : [];
  });
}

