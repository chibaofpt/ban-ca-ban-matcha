"use client";


import { Ticket, X } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { StaffCartItemCardProps } from "./StaffCartItemCard";

import { getAddonVoucherTargetChoices } from "@/src/utils/voucherMatchUtils";

/** Render the voucher selection and price row beneath the legacy admin mobile item content. */
export function AdminMobileCartItemCard({
  item, customerVouchers, applicableProductVouchers,
  applicableAddonVouchers, onRemoveProduct,
  onRemoveAddon, onOpenVoucherPicker,
}: StaffCartItemCardProps) {

  const addonRows = item.addonVouchers.map((applied) => {
    const voucher = customerVouchers.find((entry) => entry.qr_token === applied.token);
    const discount = !item.revalidating && item.errors.length === 0 && item.quantity === 1 && voucher ? getAddonVoucherTargetChoices(voucher, [applied.addonOptionId], [],
      Object.fromEntries(item.resolvedAddons.map((addon) => [addon.id, addon.priceVnd])))[0]?.discountVnd ?? 0 : 0;
    return { token: applied.token, name: voucher?.package.name ?? "Voucher topping", discount };
  });
  const lineVoucher = customerVouchers.find((entry) => entry.qr_token === item.lineVoucher?.token);
  const lineDiscount = Math.max(0, item.personalVoucherDiscountVnd - addonRows.reduce((sum, row) => sum + row.discount, 0));
  const rows = [
    ...(item.lineVoucher ? [{ token: item.lineVoucher.token, name: lineVoucher?.package.name ?? "Voucher món", discount: lineDiscount, product: true }] : []),
    ...addonRows.map((row) => ({ ...row, product: false })),
  ];
  const controls = "flex h-11 min-w-11 items-center justify-center rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
  return <div className="flex items-end gap-3 border-t border-border/50 pt-2">
    <div className="min-w-0 flex-1 space-y-2">
      {rows.length > 0 ? <div className="space-y-2">{rows.map((row) => <div key={row.token} className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg border pl-2 text-xs shadow-sm", row.product ? "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-500/30 dark:text-orange-400" : "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-500/30 dark:text-green-400")}>
        <Ticket size={14} className={cn("shrink-0", row.product ? "text-orange-500" : "text-green-600")} />
        <span className="min-w-0 flex-1 truncate">{row.name}</span>
        <span className="shrink-0 font-semibold">−{row.discount.toLocaleString("vi-VN")}đ</span>
        <button type="button" disabled={item.revalidating} className={cn(controls, "bg-white/50 transition-colors", row.product ? "text-orange-600 hover:bg-orange-200" : "text-green-700 hover:bg-green-200")} aria-label={"Gỡ " + row.name} onClick={(event) => { event.stopPropagation(); if (row.product) onRemoveProduct?.(item.cartId); else onRemoveAddon?.(item.cartId, row.token); }}><X size={14} /></button>
      </div>)}</div> : null}
      {(!item.lineVoucher && applicableProductVouchers.length > 0) || applicableAddonVouchers.length > 0 ? (
        <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-orange-300 bg-white px-3 text-[10px] font-bold text-orange-600 transition-colors hover:bg-orange-50 hover:border-solid shadow-sm focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); onOpenVoucherPicker(item.cartId); }}>
          <Ticket size={12} /> Ưu đãi ({applicableProductVouchers.length + applicableAddonVouchers.length})
        </button>
      ) : null}
    </div>
    <div className="flex shrink-0 flex-col items-end whitespace-nowrap">
      {item.lineVoucher && item.grossUnitPriceVnd !== item.payableUnitVnd ? (
        <span className="text-[10px] text-muted-foreground line-through">{(item.grossUnitPriceVnd * item.quantity) / 1000}k</span>
      ) : null}
      <span className="text-sm font-bold text-primary">{item.lineTotalVnd / 1000}k</span>
    </div>
  </div>;
}
