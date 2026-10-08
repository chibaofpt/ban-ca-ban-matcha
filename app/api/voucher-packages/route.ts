/**
 * GET /api/voucher-packages — Public route, no auth required.
 * Returns all VoucherPackage rows with is_active = true,
 * ordered by created_at asc (oldest first for stable listing).
 *
 * Caching: base package list cached in Redis (TTL 5 min).
 * Global and customer lifetime counts are fetched live and merged into the response.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCustomerIdentifier } from "@/lib/publicIdentifiers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import { toVoucherPackageBundleDto } from "@/lib/vouchers/voucherBundleDto";
import { LEGACY_PACKAGE_QUOTA_SOURCES, SELF_ACQUISITION_SOURCES } from "@/lib/vouchers/voucherIssuance";
import {
  loadVoucherAvailabilityCatalog,
  retainUsableVoucherTargetScopes,
  resolveVoucherTargetAvailability,
  type VoucherAvailabilityDatabase,
  type VoucherBundleRuleSource,
} from "@/lib/vouchers/voucherAvailability";

/** Read the public catalog, optionally scoped to an ADMIN-selected customer. */
export async function GET(request?: Request) {
  try {
    const session = await getSession();
    const customerTokens = request ? new URL(request.url).searchParams.getAll("customerQrToken") : [];
    let countUserId = session?.id;
    if (customerTokens.length > 0) {
      if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
      if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
      const parsed = z.string().uuid().safeParse(customerTokens[0]);
      if (customerTokens.length !== 1 || !parsed.success) {
        return NextResponse.json({ error: "Invalid customer QR token", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      const customer = await resolveCustomerIdentifier(parsed.data);
      if (!customer) return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
      countUserId = customer.id;
    }
    // Cache the base package list (no user-specific data)
    const cachedPackages = await withCache(
      CACHE_KEYS.VOUCHER_PACKAGES,
      CACHE_TTL.VOUCHER_PACKAGES,
      fetchVoucherPackages,
    );
    // Campaign windows and activation are live state; never put BUNDLE packages in app cache.
    const scheduledPackages = await fetchScheduledVoucherPackages(new Date());
    const packages = [...cachedPackages, ...scheduledPackages]
      .filter((pkg) => pkg.visibility !== "PRIVATE")
      .sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      );

    let globalCountMap: Record<string, number> = {};
    const packageIds = packages.map((p) => p.id);

    if (packageIds.length > 0) {
      const globalRedeemedCounts = await prisma.voucher.groupBy({
        by: ["package_id"],
        where: {
          package_id: { in: packageIds },
          issued_via: { in: [...LEGACY_PACKAGE_QUOTA_SOURCES] },
        },
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
          user_id: countUserId,
          issued_via: { in: [...SELF_ACQUISITION_SOURCES] },
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
    where: { visibility: "PUBLIC", is_active: true, ends_at: null, voucher_type: { in: ["DISCOUNT", "FREESHIP"] } },
    orderBy: { created_at: "asc" },
    include: {
      menuItem: { select: { name: true, is_available: true } },
      menuItemScopes: { include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } } },
        addonOption: { select: { label: true } },
        addonOptionScopes: { include: { addonOption: { select: { label: true, price_vnd: true, is_active: true, gram_value: true } } } },
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
      visibility: "PUBLIC",
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
      addonOptionScopes: { include: { addonOption: { select: { label: true, price_vnd: true, is_active: true, gram_value: true } } } },
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
      addonOptionScopes: pkg.addonOptionScopes,
      package: { bundleRule: pkg.bundleRule as unknown as VoucherBundleRuleSource | null },
    }, catalog);
    return resolved.availability.can_apply
      ? [toVoucherPackageBundleDto({
          ...retainUsableVoucherTargetScopes(pkg, resolved),
          bundleRule: resolved.package.bundleRule ?? null,
        } as typeof pkg)]
      : [];
  });
}

