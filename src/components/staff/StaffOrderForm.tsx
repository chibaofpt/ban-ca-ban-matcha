"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, Phone, UserX } from "lucide-react";
import * as staffOrderService from "@/src/services/staffOrderService";
import type { CreateStaffOrderPayload, CustomerSearchResult } from "@/src/services/staffOrderService";
import type { CartItem } from "@/src/lib/types/cart";

// ── Types ────────────────────────────────────────────────────────────────────

type Step = "search" | "new-customer" | "confirm";

interface StaffOrderFormProps {
  cart: CartItem[];
  total: number;
  discountVoucherId: string | null;
  discountVoucher: {
    discount_type: "PERCENT" | "FIXED";
    discount_value: number;
  } | null;
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

/**
 * Staff checkout form with fuzzy customer search + anonymous order toggle.
 * Steps: search → (new-customer) → confirm → submit.
 */
export function StaffOrderForm({
  cart,
  total,
  discountVoucherId,
  discountVoucher,
  initialPhone = "",
  onClose,
  onSuccess,
}: StaffOrderFormProps) {
  const [step, setStep] = useState<Step>("search");
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Search state
  const [query, setQuery] = useState(initialPhone);
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  // New customer form state
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Computed values ────────────────────────────────────────────────────────

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const discount = discountVoucher
    ? discountVoucher.discount_type === "PERCENT"
      ? Math.floor((subtotal * discountVoucher.discount_value) / 100)
      : discountVoucher.discount_value
    : 0;
  const finalTotal = Math.max(0, subtotal - discount);
  const pointsPreview = isAnonymous ? 0 : Math.floor(finalTotal / 10000);

  // ── Debounced search ───────────────────────────────────────────────────────

  useEffect(() => {
    if (isAnonymous || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await staffOrderService.searchCustomers(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isAnonymous]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleAnonymous = () => {
    setIsAnonymous((v) => !v);
    setQuery("");
    setSelectedCustomer(null);
    setSearchResults([]);
    setError(null);
    setStep("search");
  };

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    setSearchResults([]);
    setQuery(customer.name);
    setStep("confirm");
  };

  const handleNewCustomer = () => {
    setStep("new-customer");
    setQuery("");
    setSearchResults([]);
  };

  const handleBackToSearch = () => {
    setStep("search");
    setSelectedCustomer(null);
    setNewPhone("");
    setNewName("");
    setError(null);
  };

  const handleConfirmNewCustomer = () => {
    if (!isValidPhone(newPhone)) {
      setError("Số điện thoại không hợp lệ. Vui lòng nhập 09xxxxxxxx hoặc +84xxxxxxxxx");
      return;
    }
    if (!newName.trim()) {
      setError("Vui lòng nhập biệt danh cho khách.");
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let payload: CreateStaffOrderPayload;

      if (isAnonymous) {
        // Anonymous order — no phone, no name
        payload = {
          items: buildOrderItems(cart),
          ...(discountVoucherId ? { voucher_id: discountVoucherId } : {}),
        };
      } else if (selectedCustomer) {
        // Existing customer selected from search
        payload = {
          phone_number: selectedCustomer.phone_number,
          items: buildOrderItems(cart),
          ...(discountVoucherId ? { voucher_id: discountVoucherId } : {}),
        };
      } else {
        // New customer — phone + name
        payload = {
          phone_number: newPhone.trim(),
          customer_name: newName.trim(),
          items: buildOrderItems(cart),
          ...(discountVoucherId ? { voucher_id: discountVoucherId } : {}),
        };
      }

      await staffOrderService.createStaffOrder(payload);
      onSuccess();
    } catch (err: any) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Tạo đơn thất bại. Vui lòng thử lại.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared sub-views ───────────────────────────────────────────────────────

  const OrderSummary = () => (
    <div className="bg-secondary/30 rounded-xl p-3 text-sm space-y-1.5">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{cart.length} món</span>
        <span className="font-semibold text-primary">🐟 {finalTotal / 1000} cá</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Tích điểm</span>
        {isAnonymous ? (
          <span className="text-muted-foreground italic">Không tích điểm</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400 font-medium">+{pointsPreview} điểm</span>
        )}
      </div>
    </div>
  );

  const hasProductVoucher = cart.some(c => c.productVoucherId);
  const hasVoucher = !!discountVoucherId || hasProductVoucher;

  const AnonymousToggle = () => (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={hasVoucher}
        onClick={handleToggleAnonymous}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition ${
          hasVoucher
            ? "opacity-50 cursor-not-allowed border-border text-muted-foreground bg-secondary/10"
            : isAnonymous
            ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
            : "border-border text-muted-foreground hover:bg-secondary/40"
        }`}
      >
        <UserX size={16} className="shrink-0" />
        <span className="font-medium">Khách vãng lai (không tích điểm)</span>
        <span
          className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
            isAnonymous ? "bg-amber-500 border-amber-500" : "border-border"
          }`}
        >
          {isAnonymous && <span className="block w-2 h-2 rounded-full bg-white" />}
        </span>
      </button>
      {hasVoucher && (
        <p className="text-[11px] text-destructive px-1">
          * Không thể tạo đơn vãng lai vì giỏ hàng đang áp dụng voucher.
        </p>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-4">
        <h2 className="font-serif text-lg font-semibold">Thông tin khách hàng</h2>

        {/* Anonymous toggle — always visible */}
        <AnonymousToggle />

        {/* ── Step: search ─────────────────────────────────────────── */}
        {step === "search" && !isAnonymous && (
          <>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="staff-customer-search"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedCustomer(null);
                  setError(null);
                }}
                placeholder="Tên hoặc 4 số cuối SĐT…"
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              )}
            </div>

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="rounded-xl border border-border bg-background shadow-sm divide-y divide-border overflow-hidden">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition text-sm"
                  >
                    <User size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone size={10} />
                        {c.phone_number}
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          • 🐟 {c.points_balance} điểm
                        </span>
                      </p>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleNewCustomer}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition text-sm text-primary font-medium"
                >
                  <span className="text-lg leading-none">＋</span>
                  Tạo khách mới
                </button>
              </div>
            )}

            {/* No results hint */}
            {query.length >= 2 && !searching && searchResults.length === 0 && (
              <div className="rounded-xl border border-border bg-background">
                <button
                  type="button"
                  onClick={handleNewCustomer}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition text-sm text-primary font-medium"
                >
                  <span className="text-lg leading-none">＋</span>
                  Không tìm thấy — Tạo khách mới
                </button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Huỷ
              </button>
            </div>
          </>
        )}

        {/* ── Step: search (anonymous mode) ────────────────────────── */}
        {step === "search" && isAnonymous && (
          <>
            <OrderSummary />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Huỷ
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition disabled:opacity-60"
              >
                {submitting ? "Đang tạo…" : "Tạo đơn vãng lai"}
              </button>
            </div>
          </>
        )}

        {/* ── Step: new-customer ───────────────────────────────────── */}
        {step === "new-customer" && (
          <>
            <p className="text-sm text-muted-foreground">
              Nhập thông tin khách mới để tạo hồ sơ.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="new-customer-phone" className="text-sm font-medium text-foreground">
                  Số điện thoại
                </label>
                <input
                  id="new-customer-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => { setNewPhone(e.target.value); setError(null); }}
                  placeholder="09xxxxxxxx"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="new-customer-name" className="text-sm font-medium text-foreground">
                  Biệt danh
                </label>
                <input
                  id="new-customer-name"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmNewCustomer()}
                  placeholder="Ví dụ: Linh Cá Heo"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleBackToSearch}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Quay lại
              </button>
              <button
                onClick={handleConfirmNewCustomer}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition"
              >
                Tiếp tục
              </button>
            </div>
          </>
        )}

        {/* ── Step: confirm ────────────────────────────────────────── */}
        {step === "confirm" && (
          <>
            <p className="text-sm">
              Tạo đơn cho{" "}
              <span className="font-semibold text-primary">
                {selectedCustomer?.name ?? newName}
              </span>
              {selectedCustomer && (
                <span className="text-muted-foreground ml-1 text-xs">
                  ({selectedCustomer.phone_number})
                </span>
              )}
            </p>
            <OrderSummary />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleBackToSearch}
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
