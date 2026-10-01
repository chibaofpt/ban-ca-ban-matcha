"use client";

import Image from "next/image";
import { Ticket, Trash2, X } from "lucide-react";
import type { StaffCartItemCardProps } from "./StaffCartItemCard";
import { line1ItemDetails, line2ItemDetails, addonsDetails } from "@/src/utils/cartHelpers";
import { getAddonVoucherTargetChoices } from "@/src/utils/voucherMatchUtils";

/** Render the staged admin mobile item layout using the existing cart projection and actions. */
export function AdminMobileCartItemCard({
  item, menuItem, powderData, milkTypes, customerVouchers, applicableProductVouchers,
  applicableAddonVouchers, onEdit, onRemove, onChangeQuantity, onRemoveProduct,
  onRemoveAddon, onOpenVoucherPicker, bundleAllocationBadges = [],
}: StaffCartItemCardProps) {
  const chips = [...line1ItemDetails(item, menuItem, milkTypes, powderData?.data), ...line2ItemDetails(item), ...addonsDetails(item)];
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
  return <article className="space-y-2 rounded-xl border border-border bg-card p-3">
    <div className="flex gap-2">
      <div className="w-[104px] shrink-0 space-y-2">
        <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-muted text-3xl">
          {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={64} height={64} className="h-full w-full object-cover" /> : "🍵"}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/50">
          <button type="button" className={controls} aria-label="Giảm số lượng" disabled={item.quantity <= 1 || Boolean(item.lineVoucher)} onClick={() => onChangeQuantity(item.cartId, item.quantity - 1)}>−</button>
          <span className="text-xs font-semibold">{item.quantity}</span>
          <button type="button" className={controls} aria-label="Tăng số lượng" disabled={Boolean(item.lineVoucher)} onClick={() => onChangeQuantity(item.cartId, item.quantity + 1)}>+</button>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button type="button" disabled={!menuItem} onClick={() => onEdit(item)} className="min-h-11 flex-1 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring">{item.name}</button>
          <button type="button" onClick={() => onRemove(item.cartId)} aria-label={"Xóa " + item.name} className={controls + " text-muted-foreground"}><Trash2 size={16} /></button>
        </div>
        <button type="button" disabled={!menuItem} onClick={() => onEdit(item)} className="w-full space-y-2 rounded-lg border border-border bg-muted/40 p-2 text-left focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex flex-wrap gap-1">{chips.map((chip, index) => <span key={index} className="text-xs text-muted-foreground">{chip}{index < chips.length - 1 ? " ·" : ""}</span>)}</div>
          {item.configuration.note ? <p className="text-xs text-muted-foreground">Ghi chú: {item.configuration.note}</p> : null}
          <p className="text-right text-sm font-semibold">{item.lineTotalVnd.toLocaleString("vi-VN")}đ</p>
        </button>
      </div>
    </div>
    {bundleAllocationBadges.map((badge) => <p key={badge.token} className="rounded-lg bg-muted/50 px-2 py-1 text-xs text-muted-foreground">{badge.label}: {badge.quantity} phần</p>)}
    {rows.length > 0 ? <div className="space-y-2">{rows.map((row) => <div key={row.token} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-muted/40 pl-2 text-xs">
      <Ticket size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{row.name}</span>
      <span className="shrink-0 font-semibold text-primary">−{row.discount.toLocaleString("vi-VN")}đ</span>
      <button type="button" disabled={item.revalidating} className={controls} aria-label={"Gỡ " + row.name} onClick={() => row.product ? onRemoveProduct?.(item.cartId) : onRemoveAddon?.(item.cartId, row.token)}><X size={14} /></button>
    </div>)}</div> : null}
    {(!item.lineVoucher && applicableProductVouchers.length > 0) || applicableAddonVouchers.length > 0 ? <button type="button" className="min-h-11 w-full rounded-lg border border-dashed border-border text-xs font-semibold text-primary" onClick={() => onOpenVoucherPicker(item.cartId)}>Chọn ưu đãi</button> : null}
  </article>;
}
