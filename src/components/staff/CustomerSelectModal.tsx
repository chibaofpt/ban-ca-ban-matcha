"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, Phone } from "lucide-react";
import * as staffOrderService from "@/src/services/staffOrderService";
import type { CustomerSearchResult } from "@/src/services/staffOrderService";

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
  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New customer state
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
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
  }, [query]);

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
    const digits = query.replace(/\D/g, "");
    setNewPhone(digits);
    // If query has non-digits, it's likely a name, so prefill newName
    if (!/^\d+$/.test(query.trim())) {
      setNewName(query.trim());
    } else {
      setNewName("");
    }
    setSearchResults([]);
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl space-y-4">
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
                placeholder="Tên hoặc 4 số cuối SĐT…"
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="rounded-xl border border-border bg-background shadow-sm divide-y divide-border overflow-hidden max-h-60 overflow-y-auto overscroll-contain">
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
      </div>
    </div>
  );
}
