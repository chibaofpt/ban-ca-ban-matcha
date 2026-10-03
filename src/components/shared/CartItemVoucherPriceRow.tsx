"use client";

import type { ReactNode } from "react";
import { Ticket, X } from "lucide-react";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import type { CalcItemVoucherResult } from "@/src/utils/orderCalculator";
import { CartMoney } from "./CartMoney";

interface CartItemVoucherButtonProps {
  count: number;
  onOpen: () => void;
  disabled?: boolean;
  readOnlyReason?: string;
  label?: string;
}

/** Render the voucher picker action in either the item content or the applied-voucher row. */
export function CartItemVoucherButton({ count, onOpen, disabled = false, readOnlyReason, label = "Ưu đãi" }: CartItemVoucherButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? readOnlyReason : undefined}
      onClick={(event) => { event.stopPropagation(); onOpen(); }}
      className="flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Ticket size={12} className="shrink-0" />
      <span>{label} ({count})</span>
    </button>
  );
}

interface CartItemVoucherPriceRowProps {
  item: ProjectedCartLine;
  vouchers: ReadonlyArray<{ qr_token: string; package: { name: string } }>;
  voucherDiscounts?: CalcItemVoucherResult;
  onRemoveProduct?: (cartId: string) => void;
  onRemoveAddon?: (cartId: string, token: string) => void;
  removeDisabled?: boolean;
  readOnlyReason?: string;
  voucherPicker?: ReactNode;
  showOriginalPrice: boolean;
  rounding?: "exact" | "ceil";
}

/** Render applied vouchers and their resolved discounts beside the cart line price. */
export function CartItemVoucherPriceRow({
  item, vouchers, voucherDiscounts, onRemoveProduct, onRemoveAddon,
  removeDisabled = false, readOnlyReason, voucherPicker, showOriginalPrice,
}: CartItemVoucherPriceRowProps) {
  const lineVoucher = vouchers.find((voucher) => voucher.qr_token === item.lineVoucher?.token);
  const rows = [
    ...(item.lineVoucher ? [{
      token: item.lineVoucher.token,
      name: lineVoucher?.package.name ?? "Voucher món",
      discount: (voucherDiscounts?.product_voucher_discount_vnd ?? 0) + (voucherDiscounts?.item_voucher_discount_vnd ?? 0),
      product: true,
    }] : []),
    ...item.addonVouchers.map((applied) => ({
      token: applied.token,
      name: vouchers.find((voucher) => voucher.qr_token === applied.token)?.package.name ?? "Voucher topping",
      discount: voucherDiscounts?.addon_vouchers.find((voucher) => voucher.voucher_id === applied.token)?.discount_applied_vnd ?? 0,
      product: false,
    })),
  ];

  return (
    <div className="flex items-end gap-2 border-t border-border/50 pt-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {rows.map((row) => (
          <div key={row.token} className="flex min-w-0 max-w-full items-center gap-1 rounded-sm border-2 border-primary/20 bg-card px-1 py-0 text-[10px] text-primary">
            <Ticket size={12} className="shrink-0" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{row.name}</span>
            <CartMoney className="shrink-0 font-semibold text-red-700" amountVnd={row.discount} discount />
            <button
              type="button"
              disabled={removeDisabled}
              title={removeDisabled ? readOnlyReason : undefined}
              aria-label={"Gỡ " + row.name}
              className="flex h-6 min-w-6 shrink-0 items-center justify-center text-red-700 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(event) => { event.stopPropagation(); if (row.product) onRemoveProduct?.(item.cartId); else onRemoveAddon?.(item.cartId, row.token); }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {voucherPicker}
      </div>
      <div className="flex shrink-0 flex-col items-end whitespace-nowrap">
        {showOriginalPrice ? (
          <CartMoney className="text-[10px] text-muted-foreground line-through" amountVnd={item.grossUnitPriceVnd * item.quantity} />
        ) : null}
        <CartMoney className="text-sm font-bold text-primary" amountVnd={item.lineTotalVnd} />
      </div>
    </div>
  );
}
