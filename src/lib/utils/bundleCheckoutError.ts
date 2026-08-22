const BUNDLE_UNAVAILABLE_REASONS = [
  "TARGET_UNAVAILABLE",
  "NO_ACTIVE_QUALIFIER",
  "NO_ACTIVE_REWARD",
  "NO_ACTIVE_CONFIGURATION",
] as const;

export type BundleAvailabilityReason = (typeof BUNDLE_UNAVAILABLE_REASONS)[number];

interface VoucherAvailabilitySnapshot {
  qr_token: string;
  availability: { can_apply: boolean };
}

interface BundleApplicationStatusSnapshot {
  status?: string;
}

/** Return whether a server reason is one of the frozen unusable voucher states. */
export function isBundleAvailabilityReason(
  reason: unknown,
): reason is BundleAvailabilityReason {
  return typeof reason === "string" && BUNDLE_UNAVAILABLE_REASONS.some(
    (candidate) => candidate === reason,
  );
}

/** Return submitted BUNDLE tokens that became unusable or disappeared from the refreshed wallet. */
export function findUnavailableBundleTokens(
  voucherTokens: string[],
  refreshedVouchers: VoucherAvailabilitySnapshot[],
): string[] {
  const availabilityByToken = new Map(
    refreshedVouchers.map((voucher) => [voucher.qr_token, voucher.availability.can_apply]),
  );
  return voucherTokens.filter((token) => availabilityByToken.get(token) !== true);
}

/** Persisted BUNDLE state is an independent checkout gate from the current projection. */
export function hasBlockingBundleApplication(
  applications: BundleApplicationStatusSnapshot[],
): boolean {
  return applications.some((application) => application.status !== "READY");
}

/** Exclude blocked persisted applications from every checkout payload. */
export function getReadyBundleApplications<T extends BundleApplicationStatusSnapshot>(
  applications: T[],
): T[] {
  return applications.filter((application) => application.status === "READY");
}

/** Extract a live BUNDLE availability reason from normalized or legacy checkout errors. */
export function getBundleCheckoutAvailabilityReason(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("response" in error)) return null;
  const response = error.response;
  if (!response || typeof response !== "object" || !("status" in response) || !("data" in response)) return null;
  const data = response.data;
  if (response.status !== 422 || !data || typeof data !== "object") return null;
  const code = "code" in data ? data.code : null;
  const details = "details" in data ? data.details : null;
  const reason = details && typeof details === "object" && "reason" in details
    ? details.reason
    : null;
  if (code === "BUSINESS_RULE_VIOLATION") {
    return isBundleAvailabilityReason(reason) ? reason : null;
  }
  return code === "BUNDLE_NOT_ELIGIBLE" && typeof reason === "string"
    ? reason
    : null;
}

/** Map a BUNDLE checkout reason to customer-facing reconciliation feedback. */
export function getBundleCheckoutAvailabilityMessage(reason: string): string {
  switch (reason) {
    case "TARGET_UNAVAILABLE":
      return "Món áp dụng voucher hiện đang ngưng phục vụ.";
    case "NO_ACTIVE_QUALIFIER":
      return "Các món mua kèm hiện đang ngưng phục vụ.";
    case "NO_ACTIVE_REWARD":
      return "Quà tặng hiện không còn phục vụ.";
    case "NO_ACTIVE_CONFIGURATION":
      return "Món hiện không còn cấu hình bột hoặc sữa phù hợp.";
    default:
      return reason || "Voucher BUNDLE không còn khả dụng.";
  }
}
