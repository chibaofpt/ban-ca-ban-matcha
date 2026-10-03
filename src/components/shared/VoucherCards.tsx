"use client";

import React from "react";
import type { MenuItem } from "@/src/lib/types/menu";
import { VoucherCardFrame } from "./VoucherCardFrame";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/src/utils/cn";
import {
  type MyVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import {
  canExchange,
  getVoucherAvailabilityMessage,
} from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherActionModel } from "@/src/utils/customerVoucherSelection";

/** Shared visual selection indicator; the owning button supplies accessible state. */
export function VoucherSelectionIndicator({ selected }: { selected: boolean }) {
  return <span aria-hidden="true" className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
    selected ? "border-primary bg-primary text-primary-foreground" : "border-border/60")}>
    {selected ? <Check className="h-4 w-4" /> : null}
  </span>;
}

// ── VoucherCard (Section 1 - Ticket Layout) ───────────────────────────────────

/** Render an owned voucher through the shared card frame. */
export function VoucherCard({
  voucher,
  actionNode,
  isDisabled,
  disabledReason,
  isSelected,
  onClick,
  actionModel,
  onAction,
}: {
  voucher: MyVoucher;
  actionNode?: React.ReactNode;
  isDisabled?: boolean;
  disabledReason?: string;
  isSelected?: boolean;
  onClick?: () => void;
  actionModel?: VoucherActionModel;
  onAction?: () => void;
}) {
  const isExpired = voucher.status === "EXPIRED";
  const isRedeemed = voucher.status === "REDEEMED";
  const availabilityReason = getVoucherAvailabilityMessage(voucher);
  const isDimmed = isExpired || isRedeemed || isDisabled || !voucher.availability.can_apply;

  return (
    <VoucherCardFrame title={voucher.package.name} description={voucher.package.description}
      expiresAt={voucher.expires_at} selected={isSelected} dimmed={Boolean(isDimmed)}
      onClick={onClick} reason={disabledReason || availabilityReason}
      footer={actionModel?.kind === "selection" || actionModel?.kind === "use-now" || actionNode ? <>
          {actionModel?.kind === "selection" ? (
            <button
              type="button"
              aria-label={actionModel.selected ? "Bỏ chọn voucher" : "Chọn voucher"}
              aria-pressed={actionModel.selected}
              disabled={actionModel.disabled}
              title={actionModel.reason}
              onClick={(event) => { event.stopPropagation(); onAction?.(); }}
              className="relative z-30 ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <VoucherSelectionIndicator selected={actionModel.selected} />
            </button>
          ) : actionModel?.kind === "use-now" ? (
            <button
              type="button"
              disabled={actionModel.disabled}
              title={actionModel.reason}
              onClick={(event) => { event.stopPropagation(); onAction?.(); }}
              className="relative z-30 ml-2 flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionModel.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {actionModel.label}
            </button>
          ) : actionNode ? (
            <div className="relative z-30" onClick={(e) => { e.stopPropagation(); }}>{actionNode}</div>
          ) : null}
      </> : undefined} />
  );
}

// ── PackageCard (Section 2 - Ticket Layout) ───────────────────────────────────

/** Render an acquisition package through the shared card frame. */
export function PackageCard({
  pkg,
  userBalance,
  onExchange,
  onClick,
  isExchanging,
}: {
  pkg: VoucherPackage;
  menuItem?: MenuItem;
  userBalance: number;
  onExchange: (pkg: VoucherPackage) => void;
  onClick?: (pkg: VoucherPackage) => void;
  isExchanging: boolean;
}) {
  const { ok, reason } = canExchange(pkg, userBalance, pkg.user_redeemed_count ?? 0);

  return (
    <VoucherCardFrame title={pkg.name} description={pkg.description} expiresAfterDays={pkg.expires_after_days}
      onClick={onClick ? () => onClick(pkg) : undefined} dimmed={!ok}
      footer={<>
          <div className="flex-shrink-0">
            {(() => {
              if (isExchanging) {
                return (
                  <div className="flex min-h-11 min-w-20 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Loader2 size={14} className="animate-spin" />
                  </div>
                );
              }
              if (reason === "sold_out") {
                return <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-md">Hết hàng</span>;
              }
              if (reason === "limit_reached") {
                return <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-1 rounded-md">Đã đủ giới hạn</span>;
              }
              if (reason === "insufficient_points") {
                return (
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                      {userBalance} / {pkg.points_cost} 🐟
                    </span>
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onExchange(pkg); }}
                  className="relative z-30 min-h-11 bg-primary text-primary-foreground text-xs font-bold px-3 py-2 rounded-md hover:bg-primary/90 transition shadow-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {pkg.acquisition_mode === "FREE_CLAIM" ? "Nhận miễn phí" : `Đổi ${pkg.points_cost} 🐟`}
                </button>
              );
            })()}
          </div>
      </>} />
  );
}
