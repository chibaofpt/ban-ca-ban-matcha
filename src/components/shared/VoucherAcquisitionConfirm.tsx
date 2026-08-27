"use client";

import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import {
  computePointsAfterExchange,
  formatExpiryLabel,
  getPackageBenefitText,
} from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

/** Confirm a points exchange while showing cost, resulting balance, and expiry. */
export function VoucherAcquisitionConfirm({
  pkg,
  pointsBalance,
  isLoading,
  onConfirm,
  onCancel,
}: {
  pkg: VoucherPackage | null;
  pointsBalance: number;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmModal
      isOpen={pkg !== null}
      title="Xác nhận đổi voucher"
      message=""
      confirmLabel={pkg ? `Đổi ${pkg.points_cost} 🐟` : "Đổi voucher"}
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {pkg && (
        <div id="confirm-modal-description" className="space-y-3 text-sm text-primary/70">
          <p className="font-bold text-primary">{pkg.name}</p>
          <p>{getPackageBenefitText(pkg)}</p>
          <div className="rounded-xl bg-primary/5 p-3">
            <p>Số dư: {pointsBalance} → {computePointsAfterExchange(pointsBalance, pkg.points_cost)} 🐟</p>
            <p className="mt-1">Hạn dùng sau khi nhận: {formatExpiryLabel(pkg.expires_after_days)}</p>
          </div>
        </div>
      )}
    </ConfirmModal>
  );
}
