import type { VoucherAvailability } from "@/contracts/voucher";
import type {
  OwnedVoucherAvailabilitySource,
  VoucherAvailabilityCatalog,
} from "@/lib/vouchers/voucherAvailability";
import {
  resolveVoucherTargetAvailability,
  retainUsableVoucherTargetScopes,
} from "@/lib/vouchers/voucherAvailability";

/** Attach filtered rules and refund-aware live availability to owned voucher DTO sources. */
export function attachOwnedVoucherAvailability<T extends OwnedVoucherAvailabilitySource>(
  vouchers: T[],
  catalog: VoucherAvailabilityCatalog,
  now = new Date(),
): Array<T & { availability: VoucherAvailability }> {
  return vouchers.map((voucher) => {
    const target = resolveVoucherTargetAvailability(voucher, catalog);
    const usableVoucher = retainUsableVoucherTargetScopes(voucher, target);
    const lifecycleUsable = voucher.status === "ACTIVE" && (!voucher.expires_at || voucher.expires_at > now);
    const purchaseDelta = voucher.pointsLogs?.find((log) => log.reason === "voucher_purchase")?.delta;
    const refundPoints = purchaseDelta !== undefined ? Math.abs(purchaseDelta) : 0;
    const canRefund = voucher.issued_via === "POINTS_EXCHANGE" && lifecycleUsable &&
      !target.availability.can_apply && refundPoints > 0;
    return {
      ...usableVoucher,
      package: target.package,
      availability: {
        ...target.availability,
        can_apply: lifecycleUsable && target.availability.can_apply,
        can_refund: canRefund,
        refund_points: canRefund ? refundPoints : 0,
      },
    };
  });
}
