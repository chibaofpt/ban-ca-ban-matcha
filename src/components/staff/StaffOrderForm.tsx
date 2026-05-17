"use client";

import { useState } from "react";
import * as staffOrderService from "@/src/services/staffOrderService";
import type { CreateStaffOrderPayload } from "@/src/services/staffOrderService";
import type { CartItem } from "@/src/lib/types/cart";

// ── Types ────────────────────────────────────────────────────────────────────

type Step = "phone" | "confirm-found" | "nickname" | "confirm-new";

interface StaffOrderFormProps {
  cart: CartItem[];
  total: number;
  discountVoucherId: string | null;
  /** Pre-filled phone from QR scan — optional. */
  initialPhone?: string;
  onClose: () => void;
  /** Called after successful order — caller should clear cart and close all modals. */
  onSuccess: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Validate Vietnamese phone number (0x or +84). */
function isValidPhone(phone: string): boolean {
  return /^(0|\+84)\d{9}$/.test(phone.trim());
}

/** Map CartItem[] to the staff order API payload items. */
function buildOrderItems(cart: CartItem[]): CreateStaffOrderPayload["items"] {
  return cart.map((c) => ({
    menu_item_id: c.menuItemId,
    quantity: c.quantity,
    size: c.size,
    sweetness: c.sweetness,
    ice_option: c.iceOption,
    coldwhisk: c.coldwhisk,
    ...(c.note ? { note: c.note } : {}),
    addon_option_ids: [
      ...c.selectedOptionIds.map((id) => ({ option_id: id, quantity: 1 })),
      ...c.quantityAddonOptions,
    ],
    ...(c.productVoucherId ? { product_voucher_id: c.productVoucherId } : {}),
    ...(c.selectedPowderId ? { selected_powder_id: c.selectedPowderId } : {}),
    ...(c.selectedMilkTypeId ? { selected_milk_type_id: c.selectedMilkTypeId } : {}),
    client_price_vnd: c.clientPriceVnd,
  }));
}

// ── Component ────────────────────────────────────────────────────────────────

/** Multi-step checkout form: phone lookup → confirm or nickname → submit order. */
export function StaffOrderForm({
  cart,
  total,
  discountVoucherId,
  initialPhone = "",
  onClose,
  onSuccess,
}: StaffOrderFormProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(initialPhone);
  const [foundName, setFoundName] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step: phone ────────────────────────────────────────────────────────

  const handlePhoneSearch = async () => {
    setError(null);
    if (!isValidPhone(phone)) {
      setError("Số điện thoại không hợp lệ. Vui lòng nhập 09xxxxxxxx hoặc +84xxxxxxxxx");
      return;
    }
    setSubmitting(true);
    try {
      const result = await staffOrderService.lookupPhone(phone.trim());
      if (result.found) {
        setFoundName(result.name);
        setStep("confirm-found");
      } else {
        setStep("nickname");
      }
    } catch {
      setError("Không thể tra cứu số điện thoại. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit order ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateStaffOrderPayload = {
        phone_number: phone.trim(),
        ...(step === "confirm-new" && nickname.trim()
          ? { customer_name: nickname.trim() }
          : {}),
        items: buildOrderItems(cart),
        ...(discountVoucherId ? { voucher_id: discountVoucherId } : {}),
      };
      await staffOrderService.createStaffOrder(payload);
      onSuccess();
    } catch {
      setError("Tạo đơn thất bại. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Order summary snippet ──────────────────────────────────────────────

  const OrderSummary = () => (
    <div className="bg-secondary/30 rounded-xl p-3 text-sm flex justify-between">
      <span>{cart.length} món</span>
      <span className="font-semibold text-primary">🐟 {total / 1000} cá</span>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-4">
        <h2 className="font-serif text-lg font-semibold">Thông tin khách hàng</h2>

        {/* Step: phone */}
        {step === "phone" && (
          <>
            <div>
              <label
                htmlFor="staff-order-phone"
                className="text-sm font-medium text-foreground"
              >
                Số điện thoại khách
              </label>
              <input
                id="staff-order-phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handlePhoneSearch()}
                placeholder="09xxxxxxxx"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1.5"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Huỷ
              </button>
              <button
                onClick={handlePhoneSearch}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition disabled:opacity-60"
              >
                {submitting ? "Đang tìm…" : "Tìm kiếm"}
              </button>
            </div>
          </>
        )}

        {/* Step: confirm-found */}
        {step === "confirm-found" && (
          <>
            <p className="text-sm">
              Tạo đơn cho{" "}
              <span className="font-semibold text-primary">{foundName}</span>?
            </p>
            <OrderSummary />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setStep("phone")}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Quay lại
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition disabled:opacity-60"
              >
                {submitting ? "Đang tạo…" : "OK, tạo đơn"}
              </button>
            </div>
          </>
        )}

        {/* Step: nickname */}
        {step === "nickname" && (
          <>
            <p className="text-sm text-muted-foreground">
              SĐT này chưa có hồ sơ — nhập biệt danh để tạo mới.
            </p>
            <div>
              <label
                htmlFor="staff-order-nickname"
                className="text-sm font-medium text-foreground"
              >
                Biệt danh khách
              </label>
              <input
                id="staff-order-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ví dụ: Linh Cá Heo"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1.5"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setStep("phone")}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Quay lại
              </button>
              <button
                onClick={() => {
                  if (!nickname.trim()) {
                    setError("Vui lòng nhập biệt danh.");
                    return;
                  }
                  setError(null);
                  setStep("confirm-new");
                }}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition"
              >
                Tiếp tục
              </button>
            </div>
          </>
        )}

        {/* Step: confirm-new */}
        {step === "confirm-new" && (
          <>
            <p className="text-sm">
              Tạo đơn cho khách mới{" "}
              <span className="font-semibold text-primary">{nickname}</span>?
            </p>
            <OrderSummary />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setStep("nickname")}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Quay lại
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition disabled:opacity-60"
              >
                {submitting ? "Đang tạo…" : "OK, tạo đơn"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
