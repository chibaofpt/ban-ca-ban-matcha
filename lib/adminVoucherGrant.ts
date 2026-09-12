import { previewVoucherExpiry } from "@/lib/voucherIssuance";
import {
  issueVoucherInTransaction,
  VoucherIssuanceError,
  type IssuedVoucherResult,
  type VoucherIssuanceDatabase,
  type VoucherIssuanceTransaction,
} from "@/lib/voucherIssuance";

export type AdminVoucherGrantWarning =
  | "ACTIVE_OR_RESERVED_VOUCHER_EXISTS"
  | "SELF_ACQUISITION_LIMIT_REACHED";

interface PackageSummaryRecord {
  id: string;
  visibility: "PUBLIC" | "PRIVATE";
  max_per_user: number;
  quantity: number | null;
  expires_after_days: number | null;
  ends_at: Date | null;
  is_active: boolean;
}

export interface ManualVoucherRecord {
  id: string;
  qr_token: string;
  user_id: string;
  package_id: string;
  issuing_admin_id: string | null;
  manual_request_id: string | null;
  voucher_type: string;
  status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
  expires_at: Date | null;
  redeemed_at: Date | null;
}

export interface AdminVoucherGrantDatabase {
  voucherPackage: {
    findUnique: (args: unknown) => Promise<PackageSummaryRecord | null>;
  };
  voucher: {
    count: (args: unknown) => Promise<number>;
    findUnique?: (args: unknown) => Promise<ManualVoucherRecord | null>;
  };
}

export interface AdminVoucherRecipientSummary {
  self_acquisition_count: number;
  self_acquisition_limit: number | null;
  self_acquisition_remaining: number | null;
  current_count: number;
  used_count: number;
  global_remaining: number | null;
  grant_eligible: boolean;
  warning_reasons: AdminVoucherGrantWarning[];
  expiry_preview: Date | null;
}

export interface AdminVoucherGrantInput {
  user_id: string;
  package_id: string;
  performed_by: string;
  request_id: string;
  now?: Date;
  acknowledge_additional_gift?: boolean;
}

/** Signals that the caller must acknowledge a fresh additional-gift warning. */
export class AdminVoucherGrantConfirmationRequiredError extends Error {
  constructor(public readonly summary: AdminVoucherRecipientSummary) {
    super("Additional gift confirmation is required");
    this.name = "AdminVoucherGrantConfirmationRequiredError";
  }
}

/** Loads fresh recipient counts used by both the grant warning and history response. */
export async function getAdminVoucherRecipientSummary(
  db: AdminVoucherGrantDatabase,
  packageId: string,
  userId: string,
  now = new Date(),
): Promise<{ package: PackageSummaryRecord; summary: AdminVoucherRecipientSummary } | null> {
  const pkg = await db.voucherPackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      visibility: true,
      max_per_user: true,
      quantity: true,
      expires_after_days: true,
      ends_at: true,
      is_active: true,
    },
  });
  if (!pkg) return null;

  const [issuedCount, currentCount, usedCount, selfAcquisitionCount] = await Promise.all([
    db.voucher.count({ where: { package_id: packageId } }),
    db.voucher.count({
      where: {
        package_id: packageId,
        user_id: userId,
        OR: [
          { status: "RESERVED" },
          { status: "ACTIVE", OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
        ],
      },
    }),
    db.voucher.count({ where: { package_id: packageId, user_id: userId, status: "REDEEMED" } }),
    db.voucher.count({
      where: {
        package_id: packageId,
        user_id: userId,
        issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"] },
      },
    }),
  ]);

  const selfLimit = pkg.visibility === "PUBLIC" ? pkg.max_per_user : null;
  const warningReasons: AdminVoucherGrantWarning[] = [];
  if (currentCount > 0) warningReasons.push("ACTIVE_OR_RESERVED_VOUCHER_EXISTS");
  if (selfLimit !== null && selfAcquisitionCount >= selfLimit) warningReasons.push("SELF_ACQUISITION_LIMIT_REACHED");
  const globalRemaining = pkg.quantity === null ? null : Math.max(pkg.quantity - issuedCount, 0);
  const grantEligible = pkg.is_active && (!pkg.ends_at || pkg.ends_at > now) && (globalRemaining === null || globalRemaining > 0);

  return {
    package: pkg,
    summary: {
      self_acquisition_count: selfAcquisitionCount,
      self_acquisition_limit: selfLimit,
      self_acquisition_remaining: selfLimit === null ? null : Math.max(selfLimit - selfAcquisitionCount, 0),
      current_count: currentCount,
      used_count: usedCount,
      global_remaining: globalRemaining,
      grant_eligible: grantEligible,
      warning_reasons: warningReasons,
      expiry_preview: previewVoucherExpiry(now, pkg.expires_after_days, pkg.ends_at),
    },
  };
}

/** Resolves the durable request id before warnings so an acknowledged retry stays idempotent. */
export async function findManualVoucher(
  db: AdminVoucherGrantDatabase,
  requestId: string,
): Promise<ManualVoucherRecord | null> {
  if (!db.voucher.findUnique) return null;
  return db.voucher.findUnique({
    where: { manual_request_id: requestId },
    select: {
      id: true,
      qr_token: true,
      user_id: true,
      package_id: true,
      issuing_admin_id: true,
      manual_request_id: true,
      voucher_type: true,
      status: true,
      expires_at: true,
      redeemed_at: true,
    },
  });
}

/** Projects lifecycle expiry for an idempotent grant response without writing the row. */
export function effectiveAdminGrantStatus(
  voucher: Pick<ManualVoucherRecord, "status" | "expires_at">,
  now = new Date(),
): ManualVoucherRecord["status"] {
  return voucher.status === "ACTIVE" && voucher.expires_at !== null && voucher.expires_at <= now
    ? "EXPIRED"
    : voucher.status;
}

/** Issues one ADMIN gift after replay, warning, and snapshot checks on one transaction client. */
export async function issueAdminVoucherInTransaction(
  tx: VoucherIssuanceTransaction,
  input: AdminVoucherGrantInput,
): Promise<IssuedVoucherResult> {
  const now = input.now ?? new Date();
  const grantDb = tx as unknown as AdminVoucherGrantDatabase;
  const existing = await findManualVoucher(grantDb, input.request_id);
  if (existing) {
    if (
      existing.user_id !== input.user_id ||
      existing.package_id !== input.package_id ||
      existing.issuing_admin_id !== input.performed_by
    ) {
      throw new VoucherIssuanceError("CONFLICT", "Request id is already bound to another gift");
    }
    return { ...existing, effective_status: effectiveAdminGrantStatus(existing, now), already_granted: true };
  }

  const fresh = await getAdminVoucherRecipientSummary(grantDb, input.package_id, input.user_id, now);
  if (!fresh) throw new VoucherIssuanceError("NOT_FOUND", "Voucher package not found");
  if (fresh.summary.warning_reasons.length > 0 && !input.acknowledge_additional_gift) {
    throw new AdminVoucherGrantConfirmationRequiredError(fresh.summary);
  }

  return issueVoucherInTransaction(tx, {
    user_id: input.user_id,
    package_id: input.package_id,
    source: "ADMIN",
    performed_by: input.performed_by,
    request_id: input.request_id,
    now,
  });
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** Runs the admin gift workflow with bounded Serializable replay retries. */
export async function grantVoucherWithWarning(
  db: VoucherIssuanceDatabase,
  input: AdminVoucherGrantInput,
): Promise<IssuedVoucherResult> {
  const transactionInput = { ...input, now: input.now ?? new Date() };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        (tx) => issueAdminVoucherInTransaction(tx, transactionInput),
        { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
      );
    } catch (error) {
      if ((isPrismaError(error, "P2034") || isPrismaError(error, "P2002")) && attempt < 2) continue;
      if (isPrismaError(error, "P2034") || isPrismaError(error, "P2002")) {
        throw new VoucherIssuanceError("CONFLICT", "Voucher gift could not be serialized");
      }
      throw error;
    }
  }
  throw new VoucherIssuanceError("CONFLICT", "Voucher gift could not be serialized");
}

/** Backwards-compatible name for callers that use the issuance vocabulary. */
export const issueAdminVoucher = grantVoucherWithWarning;
