import { loadVoucherAvailabilityCatalog } from "@/lib/vouchers/voucherAvailability";
import {
  isPrismaError,
  issueVoucherInTransaction,
  VoucherIssuanceError,
  type VoucherIssuanceDatabase,
} from "@/lib/vouchers/voucherIssuance";

/** Lazily materialize all currently active AUTO_GRANT packages for one CUSTOMER. */
export async function ensureAutoGrantedVouchers(
  db: VoucherIssuanceDatabase,
  userId: string,
  now = new Date(),
): Promise<{ granted: number; already_granted: number }> {
  const packages = await db.voucherPackage.findMany({
    where: {
      acquisition_mode: "AUTO_GRANT",
      visibility: "PUBLIC",
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
