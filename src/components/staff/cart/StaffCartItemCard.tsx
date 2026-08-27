"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { Trash2, Ticket, X } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { CartItem } from "@/src/lib/types/cart";
import type { AddonGroup, MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/staffVoucherService";
import { line1ItemDetails, line2ItemDetails, addonsDetails } from "@/src/utils/cartHelpers";
import Image from "next/image";

interface StaffCartItemCardProps {
  item: CartItem;
  menuItem?: MenuItem;
  powderData?: PowderApiResponse;
  milkTypes: MilkTypeOption[];
  addonGroups: AddonGroup[];
  customerVouchers: MyVoucher[];
  applicableProductVouchers: MyVoucher[];
  applicableAddonVouchers: MyVoucher[];
  onEdit: (item: CartItem) => void;
  onRemove: (cartId: string) => void;
  onChangeQuantity: (cartId: string, quantity: number) => void;
  onRemoveProduct?: (cartId: string) => void;
  onRemoveAddon?: (cartId: string, voucherId: string) => void;
  onOpenVoucherPicker: (cartId: string) => void;
  bundleAllocationBadges?: Array<{ token: string; label: string; quantity: number }>;
}

const StaffCartItemCard = ({
  item: c,
  menuItem,
  powderData,
  milkTypes,
  addonGroups,
  customerVouchers,
  applicableProductVouchers,
  applicableAddonVouchers,
  onEdit,
  onRemove,
  onChangeQuantity,
  onRemoveProduct,
  onRemoveAddon,
  onOpenVoucherPicker,
  bundleAllocationBadges = [],
}: StaffCartItemCardProps) => {
  const hasMoreProductVouchers = !c.productVoucherId && !c.itemVoucherId && applicableProductVouchers.length > 0;
  const hasMoreAddonVouchers = applicableAddonVouchers.length > 0;
  const hasAvailableVouchers = hasMoreProductVouchers || hasMoreAddonVouchers;
  
  const appliedProductVoucherId = c.productVoucherId ?? c.itemVoucherId;
  const appliedAddonVouchers = c.addonVouchers ?? [];

  const line1Chips = line1ItemDetails(c, menuItem, milkTypes, powderData?.data);
  const line2Chips = line2ItemDetails(c);
  const addonChips = addonsDetails(c, menuItem, addonGroups, powderData?.data);
  
  const noteText = c.note || null;

  return (
    <div 
      onClick={() => onEdit?.(c)}
      className={cn(
        "bg-white dark:bg-secondary/20 rounded-2xl p-3.5 flex gap-3 shadow-sm border border-border/50 transition-colors cursor-pointer hover:border-border/80",
        !menuItem && "opacity-50 pointer-events-none"
      )}
    >
      {/* Thumbnail & Stepper */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-secondary/40 flex items-center justify-center text-3xl">
          {c.imageUrl ? (
            <Image src={c.imageUrl} alt={c.name} width={64} height={64} sizes="64px" className="w-full h-full object-cover" />
          ) : (
            "🍵"
          )}
        </div>
        {/* Stepper */}
        <div 
          className="flex items-center gap-1.5 bg-secondary/30 rounded-full px-1.5 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => onChangeQuantity(c.cartId, c.quantity - 1)}
            disabled={c.quantity <= 1 || !!appliedProductVoucherId}
            className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-[10px] shadow-sm disabled:opacity-30"
          >
            −
          </motion.button>
          <span className="text-xs font-bold w-4 text-center">{c.quantity}</span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => onChangeQuantity(c.cartId, c.quantity + 1)}
            disabled={!!appliedProductVoucherId}
            className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-[10px] shadow-sm disabled:opacity-30"
          >
            +
          </motion.button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-bold text-sm leading-tight text-primary truncate w-4/5 pr-2">
            {c.name} {c.category === "fusion" && powderData?.data?.find((p) => p.id === c.selectedPowderId)?.name && `- ${powderData?.data?.find((p) => p.id === c.selectedPowderId)?.name}`}
          </h4>
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(c.cartId); }} 
            className="text-muted-foreground hover:text-red-500 transition shrink-0 p-1 w-1/5 flex justify-end"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Customize */}
        <div className="mt-1.5 flex flex-col gap-1 w-full">
          {line1Chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {line1Chips.map((chip, idx) => (
                <span key={idx} className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">{chip}</span>
              ))}
            </div>
          )}
          {line2Chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {line2Chips.map((chip, idx) => (
                <span key={idx} className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{chip}</span>
              ))}
            </div>
          )}
          {addonChips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {addonChips.map((chip, idx) => (
                <span key={idx} className="text-[10px] font-medium bg-secondary text-secondary-foreground/90 px-1.5 py-0.5 rounded">{chip}</span>
              ))}
            </div>
          )}
          {noteText && (
            <span className="text-[10px] font-medium bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded italic inline-block w-fit">📝 {noteText}</span>
          )}
          {bundleAllocationBadges.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Phân bổ ưu đãi BUNDLE">
              {bundleAllocationBadges.map((badge) => (
                <span key={badge.token} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  {badge.label}: {badge.quantity} phần
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {/* Vouchers (Separate Line) */}
          {(appliedProductVoucherId || appliedAddonVouchers.length > 0) && (
            <div className="flex flex-col gap-1.5 w-full">
              {appliedProductVoucherId && (() => {
                const pv = customerVouchers.find(v => v.qr_token === appliedProductVoucherId);
                return (
                  <div className="text-[11px] font-medium bg-orange-50 border border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-500/30 dark:text-orange-400 px-2.5 py-1.5 rounded-lg flex items-center justify-between w-full shadow-sm">
                    <span className="flex items-center gap-1.5 truncate pr-2">
                      <Ticket size={14} className="text-orange-500 shrink-0" />
                      <span className="truncate">{pv?.package?.name || "Free món"}</span>
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); onRemoveProduct?.(c.cartId); }} className="shrink-0 p-1 bg-white/50 hover:bg-orange-200 rounded-md text-orange-600 transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                )
              })()}
              {appliedAddonVouchers.map((av, idx) => {
                const voucherInfo = customerVouchers.find(v => v.qr_token === av.voucherId);
                return (
                  <div key={`${av.voucherId}-${idx}`} className="text-[11px] font-medium bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-500/30 dark:text-green-400 px-2.5 py-1.5 rounded-lg flex items-center justify-between w-full shadow-sm">
                    <span className="flex items-center gap-1.5 truncate pr-2">
                      <Ticket size={14} className="text-green-600 shrink-0" />
                      <span className="truncate">Free {voucherInfo?.addonOption?.label || "Topping"}</span>
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); onRemoveAddon?.(c.cartId, av.voucherId); }} className="shrink-0 p-1 bg-white/50 hover:bg-green-200 rounded-md text-green-700 transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Bottom Row: Voucher Button & Price */}
          <div className="flex items-end justify-between mt-auto pt-1">
            {hasAvailableVouchers ? (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenVoucherPicker(c.cartId); }}
                className="text-[10px] font-bold bg-white border border-dashed border-orange-300 text-orange-600 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-orange-50 hover:border-solid transition-all shadow-sm"
              >
                <Ticket size={12} /> Ưu đãi ({applicableProductVouchers.length + applicableAddonVouchers.length})
              </button>
            ) : <div />}

            {/* Price */}
            <div className="flex flex-col items-end shrink-0">
              {appliedProductVoucherId && c.originalClientPriceVnd !== c.clientPriceVnd && (
                <span className="text-[10px] text-muted-foreground line-through">
                  {(c.originalClientPriceVnd * c.quantity) / 1000}k
                </span>
              )}
              <span className="font-bold text-sm text-primary">
                {(c.clientPriceVnd * c.quantity) / 1000}k
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(StaffCartItemCard, (prev, next) => {
  if (prev.item !== next.item) return false;
  if (prev.applicableProductVouchers.length !== next.applicableProductVouchers.length) return false;
  if (prev.applicableAddonVouchers.length !== next.applicableAddonVouchers.length) return false;
  return true;
});
