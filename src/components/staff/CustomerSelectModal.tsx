"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User, Phone } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as staffOrderService from "@/src/services/staffOrderService";
import type { CustomerSearchResult } from "@/src/services/staffOrderService";
import { formatVietnamPhone, normalizeCustomerSearch } from "@/src/utils/display";
import { useDebounce } from "@/src/hooks/useDebounce";

export type CustomerInfo =
  | { type: "existing"; data: CustomerSearchResult }
  | { type: "new"; phone_number: string; name: string };

interface CustomerSelectModalProps {
  initialQuery?: string;
  onClose: () => void;
  onSelect: (customer: CustomerInfo) => void;
}

function isValidPhone(phone: string): boolean {
  return /^(0|\+84)\d{9}$/.test(phone.trim());
}

export function CustomerSelectModal({
  initialQuery = "",
  onClose,
  onSelect,
}: CustomerSelectModalProps) {
  const [step, setStep] = useState<"search" | "new-customer">("search");

  // Search state
  const [query, setQuery] = useState(
    initialQuery ? formatVietnamPhone(initialQuery) : "",
  );
  const debouncedQuery = useDebounce(query.trim(), 300);

  const {
    data: searchResults = [],
    isFetching: queryFetching,
    isError: searchError,
    refetch,
  } = useQuery({
    queryKey: ["staff", "customer-search", debouncedQuery],
    queryFn: () => staffOrderService.searchCustomers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
    retry: false,
  });

  // New customer state
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalStyle; };
  }, []);

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    onSelect({ type: "existing", data: customer });
  };

  const handleNewCustomer = () => {
    setStep("new-customer");
    const normalized = normalizeCustomerSearch(query);
    setNewPhone(/^\d+$/.test(normalized) && normalized.length === 9 ? `0${normalized}` : normalized);
    // If query has non-digits, it's likely a name, so prefill newName
    if (!/^\d+$/.test(query.trim())) {
      setNewName(query.trim());
    } else {
      setNewName("");
    }
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
    onSelect({ type: "new", phone_number: newPhone.trim(), name: newName.trim() });
  };

  const rawQuery = query.trim();
  const isDebouncing = rawQuery !== debouncedQuery;
  const searching = isDebouncing || queryFetching;
  const hasCurrentResults = rawQuery.length >= 2 && rawQuery === debouncedQuery;

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay data-prevent-drawer-close="true" className="fixed inset-0 bg-black/40 z-[100]" />
        <Dialog.Content data-prevent-drawer-close="true" className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-2xl p-6 w-[90vw] max-w-sm shadow-xl space-y-4 focus:outline-none">
          <h2 className="font-serif text-lg font-semibold">
          {step === "search" ? "Tìm khách hàng" : "Thêm khách mới"}
        </h2>

        {step === "search" && (
          <>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => window.scrollTo(0, 0)}
                placeholder="Tên hoặc 4 số cuối SĐT…"
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              )}
            </div>

            {/* Search results */}
            {hasCurrentResults && !searchError && searchResults.length > 0 && (
              <div className="rounded-xl border border-border bg-background shadow-sm divide-y divide-border overflow-hidden max-h-60 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain">
                {searchResults.map((c) => (
                  <button
                    key={c.qr_token}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="min-h-11 w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition text-sm"
                  >
                    <User size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Phone size={10} />
                        {formatVietnamPhone(c.phone_number)}
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
                  className="min-h-11 w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition text-sm text-primary font-medium"
                >
                  <span className="text-lg leading-none">＋</span>
                  Tạo khách mới
                </button>
              </div>
            )}

            {hasCurrentResults && searchError && !searching && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-center justify-between gap-2">
                  <span>Không thể tìm khách hàng lúc này.</span>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="min-h-9 rounded-lg border border-red-200 bg-white px-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-red-600"
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            )}

            {hasCurrentResults && !searchError && !searching && searchResults.length === 0 && (
              <div className="rounded-xl border border-border bg-background">
                <button
                  type="button"
                  onClick={handleNewCustomer}
                  className="min-h-11 w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition text-sm text-primary font-medium"
                >
                  <span className="text-lg leading-none">＋</span>
                  Không tìm thấy — Tạo khách mới
                </button>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Đóng
              </button>
            </div>
          </>
        )}

        {step === "new-customer" && (
          <>
            <p className="text-sm text-muted-foreground">
              Nhập thông tin khách mới để tạo hồ sơ.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Số điện thoại</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => {
                    setNewPhone(e.target.value);
                    setError(null);
                  }}
                  onBlur={() => window.scrollTo(0, 0)}
                  placeholder="09xxxxxxxx"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Biệt danh</label>
                <input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setError(null);
                  }}
                  onBlur={() => window.scrollTo(0, 0)}
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmNewCustomer()}
                  placeholder="Ví dụ: Linh Cá Heo"
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setStep("search")}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
              >
                Quay lại
              </button>
              <button
                onClick={handleConfirmNewCustomer}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition"
              >
                Lưu và chọn
              </button>
            </div>
          </>
        )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
