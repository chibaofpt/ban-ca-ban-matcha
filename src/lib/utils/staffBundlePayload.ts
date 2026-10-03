import type { CartBundleApplication } from "@/src/lib/types/cart";
import type { BundleApplicationPayload } from "@/src/lib/utils/bundleVoucher";

/** Normalize committed staff applications into the single order payload shape. */
export function normalizeStaffBundleApplications(
  applications: readonly CartBundleApplication[],
  readyTokens?: ReadonlySet<string>,
): BundleApplicationPayload[] {
  return applications
    .filter((application) => !readyTokens || readyTokens.has(application.voucher_qr_token))
    .map((application) => ({
      voucher_qr_token: application.voucher_qr_token,
      qualifier_allocations: application.qualifier_allocations.map((allocation) => ({ ...allocation })),
      reward_allocations: application.reward_allocations.map((allocation) => ({ ...allocation })),
    }));
}
