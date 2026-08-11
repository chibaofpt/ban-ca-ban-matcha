type AcquisitionMode = "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";

interface PromotionWindow {
  is_active: boolean;
  starts_at: Date;
  ends_at: Date;
}

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
  menu_item_id: string | null;
  size: string | null;
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
  promotion: PromotionWindow | null;
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
  promotion: PromotionWindow | null,
): Date | null {
  const relativeExpiry =
    expiresAfterDays === null
      ? null
      : new Date(now.getTime() + expiresAfterDays * 24 * 60 * 60 * 1000);
  if (!promotion) return relativeExpiry;
  if (!relativeExpiry || promotion.ends_at < relativeExpiry) return promotion.ends_at;
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
  if (
    pkg.promotion &&
    (!pkg.promotion.is_active || now < pkg.promotion.starts_at || now >= pkg.promotion.ends_at)
  ) {
    throw new VoucherIssuanceError("PROMOTION_NOT_ACTIVE", "Promotion is outside its active window");
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
): Promise<IssuedVoucherResult> {
  const now = input.now ?? new Date();
  const pkg = await tx.voucherPackage.findUnique({
    where: { id: input.package_id },
    include: { promotion: true, addonOption: { include: { group: true } } },
  });
  assertPackageAvailable(pkg, input.source, now);

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
      menu_item_id: pkg.menu_item_id,
      size: pkg.size,
      matcha_powder_id: pkg.matcha_powder_id,
      milk_type_id: pkg.milk_type_id,
      included_addon_option_ids: pkg.included_addon_option_ids,
      addon_option_id: pkg.addon_option_id,
      covered_price_vnd: pkg.covered_price_vnd,
      covered_delivery_fee_vnd: pkg.covered_delivery_fee_vnd,
      min_order_vnd: pkg.min_order_vnd,
      status: "ACTIVE",
      expires_at: calculateExpiry(now, pkg.expires_after_days, pkg.promotion),
    },
  });

  if (input.source === "POINTS_EXCHANGE") {
    await tx.pointsLog.create({
      data: {
        user_id: input.user_id,
        delta: -pkg.points_cost,
        reason: "voucher_purchase",
        voucher_id: voucher.id,
        performed_by: null,
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
      OR: [
        { promotion: null },
        {
          promotion: { is_active: true, starts_at: { lte: now }, ends_at: { gt: now } },
        },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let granted = 0;
  let alreadyGranted = 0;
  for (const pkg of packages.sort((left, right) => left.id.localeCompare(right.id))) {
    try {
      const result = await issueVoucher(db, {
        user_id: userId,
        package_id: pkg.id,
        source: "AUTO_GRANT",
        now,
      });
      if ("already_granted" in result) alreadyGranted += 1;
      else granted += 1;
    } catch (error) {
      if (
        error instanceof VoucherIssuanceError &&
        ["VOUCHER_SOLD_OUT", "VOUCHER_LIMIT_REACHED", "PROMOTION_NOT_ACTIVE", "NOT_FOUND"].includes(
          error.reason,
        )
      ) {
        continue;
      }
      throw error;
    }
  }
  return { granted, already_granted: alreadyGranted };
}
