"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/src/utils/cn";
import {
  type MyVoucher,
  type VoucherPackage,
} from "@/src/services/customerVoucherService";
import {
  canExchange,
  getVoucherBenefitText,
  getPackageBenefitText,
  formatExpiryLabel,
  formatVoucherExpiry,
  formatRedeemedDate,
  getTicketHighlightText,
  getVoucherAvailabilityMessage,
  VOUCHER_TYPE_CONFIG,
} from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherActionModel } from "@/src/utils/customerVoucherSelection";

// ── VoucherCard (Section 1 - Ticket Layout) ───────────────────────────────────

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
  const isInteractable = Boolean(onClick);
  const typeConfig = VOUCHER_TYPE_CONFIG[voucher.voucher_type];
  const highlight = getTicketHighlightText(voucher.voucher_type, voucher.discount_type, voucher.discount_value, voucher.reference_size);

  const isExpired = voucher.status === "EXPIRED";
  const isRedeemed = voucher.status === "REDEEMED";
  const isReserved = voucher.status === "RESERVED";
  const availabilityReason = getVoucherAvailabilityMessage(voucher);
  const isDimmed = isExpired || isRedeemed || isDisabled || !voucher.availability.can_apply;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className={cn(
        "rounded-xl shadow-sm border overflow-hidden flex relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isSelected ? "bg-[#f2f7ed] border-[#8ab275] hover:border-[#8ab275]" : "bg-card",
        isDimmed && "opacity-60 grayscale-[40%]",
        isInteractable && onClick && !isSelected && "cursor-pointer hover:border-primary/50"
      )}
    >
      {isInteractable ? (
        <button
          type="button"
          aria-label={`Xem chi tiết ${voucher.package.name}`}
          onClick={(event) => { event.stopPropagation(); onClick?.(); }}
          className="absolute inset-0 z-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      ) : null}
      {/* Left side: Highlight Ticket */}
      <div className={cn(
        "w-[32%] flex flex-col items-center justify-center p-3 border-r-2 border-dashed",
        isDimmed ? "bg-muted/50 text-muted-foreground border-border/60" : 
        isSelected ? "bg-[#e6f0de] text-[#4d7338] border-[#8ab275]/40" : "bg-primary/5 text-primary border-border/60"
      )}>
        <span className="font-black text-xl lg:text-2xl tracking-tighter leading-none text-center">{highlight.text}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">{highlight.subtext}</span>
      </div>

      {/* Right side: Info */}
      <div className={cn("flex-1 min-w-0 p-3 flex flex-col justify-center z-10", isSelected ? "bg-transparent" : "bg-card")}>
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", typeConfig.badgeCls)}>
            {typeConfig.label}
          </span>
          {isReserved && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-700">
              Đang dùng
            </span>
          )}
          {isExpired && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              Hết hạn
            </span>
          )}
          {isRedeemed && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
              Đã dùng
            </span>
          )}
          {voucher.status === "ACTIVE" && !voucher.availability.can_apply ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              Tạm không dùng được
            </span>
          ) : null}
        </div>
        
        <p className="font-bold text-sm text-foreground leading-tight line-clamp-1">
          {voucher.package.name}
        </p>
        <p className="text-xs text-primary font-medium mt-0.5 line-clamp-1">
          {getVoucherBenefitText(voucher)}
        </p>
        
        {disabledReason && (
          <p className="text-[10px] text-red-500 mt-0.5 line-clamp-1">{disabledReason}</p>
        )}
        {!disabledReason && availabilityReason ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] text-amber-700">{availabilityReason}</p>
        ) : null}

        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            {isRedeemed ? formatRedeemedDate(voucher.redeemed_at) : formatVoucherExpiry(voucher.expires_at)}
          </p>
          
          {actionModel?.kind === "selection" ? (
            <button
              type="button"
              aria-label={actionModel.selected ? "Bỏ chọn voucher" : "Chọn voucher"}
              aria-pressed={actionModel.selected}
              disabled={actionModel.disabled}
              title={actionModel.reason}
              onClick={(event) => { event.stopPropagation(); onAction?.(); }}
              className="relative z-30 ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionModel.selected ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <span className="h-5 w-5 rounded-full border border-border/60" />
              )}
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
            <div onClick={(e) => { e.stopPropagation(); }}>{actionNode}</div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

// ── PackageCard (Section 2 - Ticket Layout) ───────────────────────────────────

export function PackageCard({
  pkg,
  userBalance,
  onExchange,
  isExchanging,
}: {
  pkg: VoucherPackage;
  userBalance: number;
  onExchange: (pkg: VoucherPackage) => void;
  isExchanging: boolean;
}) {
  const { ok, reason } = canExchange(pkg, userBalance, pkg.user_redeemed_count ?? 0);
  const typeConfig = VOUCHER_TYPE_CONFIG[pkg.voucher_type] ?? VOUCHER_TYPE_CONFIG.DISCOUNT;
  const highlight = getTicketHighlightText(pkg.voucher_type, pkg.discount_type, pkg.discount_value, pkg.reference_size);

  // Calculate progress for insufficient points
  const progressPercent = pkg.points_cost > 0
    ? Math.min(100, Math.round((userBalance / pkg.points_cost) * 100))
    : 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl bg-card shadow-sm border overflow-hidden flex relative"
    >
      {/* Progress background if insufficient points */}
      {!ok && reason === "insufficient_points" && (
        <div 
          className="absolute left-0 bottom-0 top-0 bg-primary/5 transition-all duration-500 ease-out z-0"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      {/* Left side: Highlight Ticket */}
      <div className="w-[32%] flex flex-col items-center justify-center p-3 border-r-2 border-dashed border-border/60 bg-primary/5 text-primary z-10">
        <span className="font-black text-xl lg:text-2xl tracking-tighter leading-none text-center">{highlight.text}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">{highlight.subtext}</span>
      </div>

      {/* Right side: Info */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center z-10 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", typeConfig.badgeCls)}>
            {typeConfig.label}
          </span>
          {(pkg.remaining_quantity ?? pkg.quantity) !== null &&
            (pkg.remaining_quantity ?? pkg.quantity)! <= 10 &&
            (pkg.remaining_quantity ?? pkg.quantity)! > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
              Còn {pkg.remaining_quantity ?? pkg.quantity}
            </span>
          )}
        </div>

        <p className="font-bold text-sm text-foreground leading-tight line-clamp-1">{pkg.name}</p>
        <p className="text-xs text-primary font-medium mt-0.5 line-clamp-2">{getPackageBenefitText(pkg)}</p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {pkg.expires_after_days !== null ? (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock size={10} />
              Hạn: {formatExpiryLabel(pkg.expires_after_days)}
            </p>
          ) : <div />}

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
                  onClick={() => onExchange(pkg)}
                  className="min-h-11 bg-primary text-primary-foreground text-xs font-bold px-3 py-2 rounded-md hover:bg-primary/90 transition shadow-sm whitespace-nowrap"
                >
                  {pkg.acquisition_mode === "FREE_CLAIM" ? "Nhận miễn phí" : `Đổi ${pkg.points_cost} 🐟`}
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
