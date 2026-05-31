"use client";

import { Trash2, User, UserX } from "lucide-react";
import type { CartItem } from "@/src/lib/types/cart";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { CustomerInfo } from "./CustomerSelectModal";

// ── Constants ────────────────────────────────────────────────────────────────

const SWEETNESS_LABEL: Record<SweetnessLevel, string> = {
  NONE: "Lạt",
  QUARTER: "Ít ngọt",
  HALF: "Vừa",
  THREE_QUARTER: "Ngọt",
  FULL: "Rất ngọt",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface StaffCartDrawerProps {
  cart: CartItem[];
  discountVoucher: {
    discount_type: "PERCENT" | "FIXED";
    discount_value: number;
  } | null;
  customerInfo: CustomerInfo | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onRemove: (cartId: string) => void;
  /** newQty is already validated >= 1 by the stepper. */
  onChangeQuantity: (cartId: string, newQty: number) => void;
  onCheckout: () => void;
  onOpenCustomerSelect: () => void;
  onClearCustomer: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Bottom drawer showing cart items, totals, discount, and checkout CTA. Pure display — owns no state. */
export function StaffCartDrawer({
  cart,
  discountVoucher,
  customerInfo,
  isSubmitting,
  onClose,
  onRemove,
  onChangeQuantity,
  onCheckout,
  onOpenCustomerSelect,
  onClearCustomer,
}: StaffCartDrawerProps) {
  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const discount = discountVoucher
    ? discountVoucher.discount_type === "PERCENT"
      ? Math.floor((subtotal * discountVoucher.discount_value) / 100)
      : discountVoucher.discount_value
    : 0;
  const total = Math.max(0, subtotal - discount);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl max-h-[82vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h2 className="font-serif text-lg font-semibold">
            Giỏ hàng ({cart.length} món)
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground text-sm hover:text-foreground transition"
            aria-label="Đóng giỏ hàng"
          >
            ✕
          </button>
        </div>

        {/* Customer Section */}
        <div className="px-4 pb-2 shrink-0">
          <div className="bg-secondary/20 rounded-xl p-3 border border-border flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-secondary/40 flex items-center justify-center shrink-0">
                {customerInfo ? <User size={15} className="text-primary" /> : <UserX size={15} className="text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight truncate">
                  {customerInfo ? customerInfo.type === "existing" ? customerInfo.data.name : customerInfo.name : "Khách vãng lai"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {customerInfo 
                    ? (customerInfo.type === "existing" ? `${customerInfo.data.phone_number} • 🐟 ${customerInfo.data.points_balance}` : customerInfo.phone_number) 
                    : "Không tích điểm"}
                </p>
              </div>
            </div>
            
            {customerInfo ? (
              <button 
                onClick={onClearCustomer}
                className="text-xs text-destructive hover:opacity-70 transition px-2 py-1 shrink-0"
              >
                Huỷ
              </button>
            ) : (
              <button 
                onClick={onOpenCustomerSelect}
                className="text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition shrink-0"
              >
                Tìm / Thêm
              </button>
            )}
          </div>
        </div>

        {/* Item list */}
        <div className="overflow-y-auto flex-1 px-4 space-y-3 pb-2">
          {cart.map((c) => (
            <div key={c.cartId} className="bg-secondary/30 rounded-xl p-3 flex gap-3">
              {/* Thumbnail */}
              <div className="shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-secondary/40 flex items-center justify-center text-2xl">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  "🍵"
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm leading-tight">
                    {c.name}
                  </h4>
                  <span className="text-primary font-semibold text-sm whitespace-nowrap">
                    🐟 {(c.unitPrice * c.quantity) / 1000} cá
                  </span>
                </div>

                {/* Customization detail pills */}
                {c.details && c.details.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.details.map((d, i) => (
                      <span
                        key={i}
                        className="inline-block text-[10px] bg-secondary/50 text-muted-foreground rounded-full px-2 py-0.5 leading-tight"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  // Fallback for items added before this change
                  <p className="text-[11px] text-muted-foreground">
                    {SWEETNESS_LABEL[c.sweetness]}
                    {c.selectedOptionIds.length > 0 && ` • ${c.selectedOptionIds.length} addon`}
                  </p>
                )}

                {/* Note */}
                {c.note && (
                  <p className="text-[11px] italic text-muted-foreground">
                    &quot;{c.note}&quot;
                  </p>
                )}

                {/* Quantity stepper */}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => onChangeQuantity(c.cartId, c.quantity - 1)}
                    disabled={c.quantity <= 1}
                    className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-xs disabled:opacity-30 hover:bg-secondary/40 transition"
                    aria-label="Giảm số lượng"
                  >
                    −
                  </button>
                  <span className="text-sm font-medium w-5 text-center">{c.quantity}</span>
                  <button
                    onClick={() => onChangeQuantity(c.cartId, c.quantity + 1)}
                    className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-xs hover:bg-secondary/40 transition"
                    aria-label="Tăng số lượng"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => onRemove(c.cartId)}
                className="text-destructive p-1 self-start shrink-0 hover:opacity-70 transition"
                aria-label="Xoá khỏi giỏ"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 space-y-2">
          {/* Subtotal */}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tạm tính</span>
            <span>🐟 {subtotal / 1000} cá</span>
          </div>

          {/* Discount line */}
          {discountVoucher && (
            <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
              <span>
                Giảm giá (
                {discountVoucher.discount_type === "PERCENT"
                  ? `${discountVoucher.discount_value}%`
                  : `🐟 ${discountVoucher.discount_value / 1000} cá`}
                )
              </span>
              <span>−🐟 {discount / 1000} cá</span>
            </div>
          )}

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tích điểm (dự kiến)</span>
            {customerInfo ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                +{Math.floor(total / 10000)} điểm
              </span>
            ) : (
              <span className="italic text-xs mt-0.5">Không (Khách vãng lai)</span>
            )}
          </div>

          {/* Total */}
          <div className="flex justify-between font-semibold text-lg text-primary">
            <span>Tổng cộng</span>
            <span>🐟 {total / 1000} cá</span>
          </div>

          <button
            onClick={onCheckout}
            disabled={isSubmitting}
            className="w-full bg-primary text-primary-foreground rounded-xl h-11 font-medium text-sm hover:bg-primary/90 transition mt-1 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                Đang tạo đơn...
              </>
            ) : (
              "Chốt đơn"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
