import type { Size } from "@prisma/client";
import {
  loadVoucherAvailabilityCatalog,
  resolveVoucherTargetAvailability,
  type VoucherAvailabilityCatalog,
  type VoucherAvailabilityDatabase,
  type VoucherBundleRuleSource,
} from "@/lib/voucherAvailability";

type AcquisitionMode = "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";

interface VoucherPackageSnapshot {
  id: string;
  name: string;
  voucher_type: string;
  acquisition_mode: AcquisitionMode;
  points_cost: number;
  is_active: boolean;
  quantity: number | null;
  max_per_user: number;
  expires_after_days: number | null;
  discount_type: string | null;
  discount_value: number | null;
  product_discount_mode: "FIXED_AMOUNT" | "PAY_AS_SIZE" | null;
  menu_item_id: string | null;
  eligible_sizes: Size[];
  reference_size: Size | null;
  size: Size | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  included_addon_option_ids: string[];
  addon_option_id: string | null;
  addonOption?: {
    is_active: boolean;
    gram_value: unknown | null;
    group: { is_active: boolean };
  } | null;
  covered_price_vnd: number | null;
  covered_delivery_fee_vnd: number | null;
  min_order_vnd: number | null;
  ends_at: Date | null;
  bundleRule?: VoucherBundleRuleSource | null;
  menuItemScopes?: Array<{ menu_item_id: string }>;
}

interface CreatedVoucher {
  id: string;
  qr_token?: string;
  [key: string]: unknown;
}

export interface VoucherIssuanceTransaction {
  voucherPackage: {
    findUnique: (args: unknown) => Promise<VoucherPackageSnapshot | null>;
  };
  voucher: {
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<CreatedVoucher>;
  };
  user: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  pointsLog: {
    create: (args: unknown) => Promise<unknown>;
  };
  voucherGrant: {
    findUnique: (args: unknown) => Promise<{ voucher_id: string } | null>;
    create: (args: unknown) => Promise<unknown>;
  };
  menuItem: VoucherAvailabilityDatabase["menuItem"];
  matchaPowder: VoucherAvailabilityDatabase["matchaPowder"];
  milkType: VoucherAvailabilityDatabase["milkType"];
  addonOption: VoucherAvailabilityDatabase["addonOption"];
}

export interface VoucherIssuanceDatabase {
  voucherPackage: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
  $transaction: <T>(
    callback: (tx: VoucherIssuanceTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable"; maxWait: number; timeout: number },
  ) => Promise<T>;
}

export interface IssueVoucherInput {
  user_id: string;
  package_id: string;
  source: AcquisitionMode;
  now?: Date;
  performed_by?: string | null;
}

export type IssuedVoucherResult = CreatedVoucher | { id: string; already_granted: true };

/** Stable business error raised by all voucher acquisition modes. */
export class VoucherIssuanceError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "VoucherIssuanceError";
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function calculateExpiry(
  now: Date,
  expiresAfterDays: number | null,
  packageEndsAt: Date | null,
): Date | null {
  const relativeExpiry =
    expiresAfterDays === null
      ? null
      : new Date(now.getTime() + expiresAfterDays * 24 * 60 * 60 * 1000);
  if (!packageEndsAt) return relativeExpiry;
  if (!relativeExpiry || packageEndsAt < relativeExpiry) return packageEndsAt;
  return relativeExpiry;
}

function assertPackageAvailable(
  pkg: VoucherPackageSnapshot | null,
  source: AcquisitionMode,
  now: Date,
): asserts pkg is VoucherPackageSnapshot {
  if (!pkg || !pkg.is_active) {
    throw new VoucherIssuanceError("NOT_FOUND", "Voucher package is unavailable");
  }
  if (
    pkg.voucher_type === "ADDON" &&
    (!pkg.addonOption || !pkg.addonOption.is_active || !pkg.addonOption.group.is_active || pkg.addonOption.gram_value !== null)
  ) {
    throw new VoucherIssuanceError("NOT_FOUND", "Voucher package targets an unavailable addon");
  }
  if (pkg.acquisition_mode !== source) {
    throw new VoucherIssuanceError(
      "ACQUISITION_MODE_MISMATCH",
      "Voucher package cannot be acquired through this flow",
    );
  }
  if (pkg.ends_at && now >= pkg.ends_at) {
    throw new VoucherIssuanceError("VOUCHER_PACKAGE_EXPIRED", "Voucher package has ended");
  }
}

async function assertIssuanceLimits(
  tx: VoucherIssuanceTransaction,
  pkg: VoucherPackageSnapshot,
  userId: string,
): Promise<void> {
  if (pkg.quantity !== null) {
    const issuedCount = await tx.voucher.count({ where: { package_id: pkg.id } });
    if (issuedCount >= pkg.quantity) {
      throw new VoucherIssuanceError("VOUCHER_SOLD_OUT", "Voucher package is sold out");
    }
  }
  const userIssuedCount = await tx.voucher.count({
    where: { package_id: pkg.id, user_id: userId },
  });
  if (userIssuedCount >= pkg.max_per_user) {
    throw new VoucherIssuanceError("VOUCHER_LIMIT_REACHED", "Per-user voucher limit reached");
  }
}

/** Issue one voucher using a caller-owned Serializable transaction. */
export async function issueVoucherInTransaction(
  tx: VoucherIssuanceTransaction,
  input: IssueVoucherInput,
  availabilityCatalog?: VoucherAvailabilityCatalog,
): Promise<IssuedVoucherResult> {
  const now = input.now ?? new Date();
  const pkg = await tx.voucherPackage.findUnique({
    where: { id: input.package_id },
    include: {
      addonOption: { include: { group: true } },
      bundleRule: {
        include: { productScopes: { include: { sizes: true } }, addonRewards: true },
      },
      menuItemScopes: { select: { menu_item_id: true }, orderBy: { menu_item_id: "asc" } },
    },
  });
  assertPackageAvailable(pkg, input.source, now);
  if (["ITEM", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "BUNDLE"].includes(pkg.voucher_type)) {
    const catalog = availabilityCatalog ?? await loadVoucherAvailabilityCatalog(tx);
    const resolved = resolveVoucherTargetAvailability({
      voucher_type: pkg.voucher_type,
      menu_item_id: pkg.menu_item_id,
      size: pkg.size,
      eligible_sizes: pkg.eligible_sizes,
      reference_size: pkg.reference_size,
      product_discount_mode: pkg.product_discount_mode,
      menuItemScopes: pkg.menuItemScopes,
      matcha_powder_id: pkg.matcha_powder_id,
      milk_type_id: pkg.milk_type_id,
      addon_option_id: pkg.addon_option_id,
      package: { bundleRule: pkg.bundleRule },
    }, catalog);
    if (!resolved.availability.can_apply) {
      throw new VoucherIssuanceError(resolved.availability.status, "Voucher has no active target");
    }
  }

  if (input.source !== "POINTS_EXCHANGE") {
    const existingGrant = await tx.voucherGrant.findUnique({
      where: { user_id_package_id: { user_id: input.user_id, package_id: pkg.id } },
      select: { voucher_id: true },
    });
    if (existingGrant) {
      return { id: existingGrant.voucher_id, already_granted: true };
    }
  }

  await assertIssuanceLimits(tx, pkg, input.user_id);
  if (input.source === "POINTS_EXCHANGE") {
    const updated = await tx.user.updateMany({
      where: { id: input.user_id, points_balance: { gte: pkg.points_cost } },
      data: { points_balance: { decrement: pkg.points_cost } },
    });
    if (updated.count !== 1) {
      throw new VoucherIssuanceError("INSUFFICIENT_POINTS", "Insufficient points");
    }
  }

  const voucher = await tx.voucher.create({
    data: {
      user_id: input.user_id,
      package_id: pkg.id,
      issued_via: input.source,
      voucher_type: pkg.voucher_type,
      discount_type: pkg.discount_type,
      discount_value: pkg.discount_value,
      product_discount_mode: pkg.product_discount_mode,
      menu_item_id: pkg.menu_item_id,
      eligible_sizes: pkg.eligible_sizes,
      reference_size: pkg.reference_size,
      size: pkg.size,
      matcha_powder_id: pkg.matcha_powder_id,
      milk_type_id: pkg.milk_type_id,
      included_addon_option_ids: pkg.included_addon_option_ids,
      addon_option_id: pkg.addon_option_id,
      covered_price_vnd: pkg.covered_price_vnd,
      covered_delivery_fee_vnd: pkg.covered_delivery_fee_vnd,
      min_order_vnd: pkg.min_order_vnd,
      status: "ACTIVE",
      expires_at: calculateExpiry(now, pkg.expires_after_days, pkg.ends_at),
      ...(pkg.voucher_type === "PRODUCT_DISCOUNT" && pkg.menuItemScopes?.length
        ? { menuItemScopes: { create: pkg.menuItemScopes.map(({ menu_item_id }) => ({ menu_item_id })) } }
        : {}),
    },
  });

  if (input.source === "POINTS_EXCHANGE") {
    await tx.pointsLog.create({
      data: {
        user_id: input.user_id,
        delta: -pkg.points_cost,
        reason: "voucher_purchase",
        voucher_id: voucher.id,
        performed_by: input.performed_by ?? null,
        order_id: null,
      },
    });
  } else {
    await tx.voucherGrant.create({
      data: { user_id: input.user_id, package_id: pkg.id, voucher_id: voucher.id },
    });
  }
  return voucher;
}

/** Issue one voucher in a short Serializable transaction with bounded P2034 retry. */
export async function issueVoucher(
  db: VoucherIssuanceDatabase,
  input: IssueVoucherInput,
): Promise<IssuedVoucherResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        (tx) => issueVoucherInTransaction(tx, input),
        { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
      );
    } catch (error) {
      if (isPrismaError(error, "P2034") && attempt < 2) continue;
      if (isPrismaError(error, "P2002")) {
        if (input.source !== "POINTS_EXCHANGE") return { id: "", already_granted: true };
        throw new VoucherIssuanceError("VOUCHER_ALREADY_GRANTED", "Voucher was already claimed");
      }
      throw error;
    }
  }
  throw new VoucherIssuanceError("CONFLICT", "Voucher issuance could not be serialized");
}

/** Lazily materialize all currently active AUTO_GRANT packages for one CUSTOMER. */
export async function ensureAutoGrantedVouchers(
  db: VoucherIssuanceDatabase,
  userId: string,
  now = new Date(),
): Promise<{ granted: number; already_granted: number }> {
  const packages = await db.voucherPackage.findMany({
    where: {
      acquisition_mode: "AUTO_GRANT",
      is_active: true,
      OR: [{ ends_at: null }, { ends_at: { gt: now } }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const sortedPackages = packages.sort((left, right) => left.id.localeCompare(right.id));
  if (sortedPackages.length === 0) return { granted: 0, already_granted: 0 };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const catalog = await loadVoucherAvailabilityCatalog(tx);
        let granted = 0;
        let alreadyGranted = 0;
        for (const pkg of sortedPackages) {
          try {
            const result = await issueVoucherInTransaction(tx, {
              user_id: userId,
              package_id: pkg.id,
              source: "AUTO_GRANT",
              now,
            }, catalog);
            if ("already_granted" in result) alreadyGranted += 1;
            else granted += 1;
          } catch (error) {
            if (
              error instanceof VoucherIssuanceError &&
              ["VOUCHER_SOLD_OUT", "VOUCHER_LIMIT_REACHED", "VOUCHER_PACKAGE_EXPIRED", "NOT_FOUND",
                "TARGET_UNAVAILABLE", "NO_ACTIVE_QUALIFIER", "NO_ACTIVE_REWARD", "NO_ACTIVE_CONFIGURATION"].includes(error.reason)
            ) {
              continue;
            }
            throw error;
          }
        }
        return { granted, already_granted: alreadyGranted };
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });
    } catch (error) {
      if ((isPrismaError(error, "P2034") || isPrismaError(error, "P2002")) && attempt < 2) continue;
      throw error;
    }
  }
  throw new VoucherIssuanceError("CONFLICT", "AUTO_GRANT issuance could not be serialized");
}
