"use client";

import { Check, Minus, Plus } from "lucide-react";
import {
  deriveBundleSelectionState,
  formatBundleBenefit,
  setBundleAllocationQuantity,
  type BundleCartSummaryItem,
  type BundleSelectionAllocation,
  type BundleVoucherSummary,
} from "@/src/lib/utils/bundleVoucher";
import { cn } from "@/src/utils/cn";

export interface BundleRewardOption extends BundleSelectionAllocation {
  label: string;
}

/** Shared explicit reward selector used by customer cart and staff counter flows. */
export function BundleRewardSelector({
  voucher,
  cart,
  options,
  selected,
  onChange,
}: {
  voucher: BundleVoucherSummary;
  cart: BundleCartSummaryItem[];
  options: BundleRewardOption[];
  selected: BundleSelectionAllocation[];
  onChange: (allocations: BundleSelectionAllocation[]) => void;
}) {
  const state = deriveBundleSelectionState({ voucher, cart, allocations: selected });
  const selectedKeys = new Set(
    selected.map((item) => `${item.client_line_id}:${item.addon_option_id ?? "PRODUCT"}`),
  );

  function toggle(option: BundleRewardOption): void {
    const key = `${option.client_line_id}:${option.addon_option_id ?? "PRODUCT"}`;
    if (selectedKeys.has(key)) {
      onChange(
        selected.filter(
          (item) => `${item.client_line_id}:${item.addon_option_id ?? "PRODUCT"}` !== key,
        ),
      );
      return;
    }
    onChange(
      setBundleAllocationQuantity(
        selected,
        {
          client_line_id: option.client_line_id,
          ...(option.addon_option_id ? { addon_option_id: option.addon_option_id } : {}),
        },
        1,
      ),
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
      <div>
        <p className="text-sm font-bold text-rose-900">{formatBundleBenefit(voucher)}</p>
        <p
          className={cn(
            "mt-1 text-xs",
            state.status === "READY" ? "text-emerald-700" : "text-rose-700",
          )}
          aria-live="polite"
        >
          {state.message}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const key = `${option.client_line_id}:${option.addon_option_id ?? "PRODUCT"}`;
          const allocation = selected.find(
            (item) => `${item.client_line_id}:${item.addon_option_id ?? "PRODUCT"}` === key,
          );
          const isSelected = selectedKeys.has(key);
          return (
            <div
              key={key}
              className={cn(
                "flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                isSelected
                  ? "border-rose-500 bg-white text-rose-900"
                  : "border-rose-200 bg-white/70 text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={state.status === "INELIGIBLE"}
                onClick={() => toggle(option)}
                className="flex min-h-11 flex-1 items-center justify-between text-left disabled:cursor-not-allowed"
              >
                <span>{option.label}</span>
                {isSelected ? <Check className="size-4" aria-hidden="true" /> : null}
              </button>
              {allocation ? (
                <div className="ml-2 flex items-center gap-1" aria-label="Số lượng quà">
                  <button
                    type="button"
                    aria-label={`Giảm ${option.label}`}
                    onClick={() =>
                      onChange(
                        setBundleAllocationQuantity(
                          selected,
                          {
                            client_line_id: option.client_line_id,
                            ...(option.addon_option_id
                              ? { addon_option_id: option.addon_option_id }
                              : {}),
                          },
                          allocation.quantity - 1,
                        ),
                      )
                    }
                    className="flex size-11 items-center justify-center rounded-lg bg-rose-100"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-6 text-center">{allocation.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Tăng ${option.label}`}
                    disabled={allocation.quantity >= option.quantity}
                    onClick={() =>
                      onChange(
                        setBundleAllocationQuantity(
                          selected,
                          {
                            client_line_id: option.client_line_id,
                            ...(option.addon_option_id
                              ? { addon_option_id: option.addon_option_id }
                              : {}),
                          },
                          allocation.quantity + 1,
                        ),
                      )
                    }
                    className="flex size-11 items-center justify-center rounded-lg bg-rose-100 disabled:opacity-40"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
