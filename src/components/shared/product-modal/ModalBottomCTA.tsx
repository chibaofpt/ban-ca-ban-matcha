import React from "react";
import { cn } from "@/src/utils/cn";
import { formatKa } from "@/src/utils/display";

interface ModalBottomCTAProps {
  totalCost: number;
  quantity: number;
  setQuantity: (qty: number) => void;
  hideQuantityPicker: boolean;
  handleAddToCart: () => void;
  isEditing: boolean;
  /** Override the action label (e.g. "Chọn món này" for bundle selection). */
  ctaLabel?: string;
}

/** Bottom action bar for ProductModal — quantity stepper + merged price/CTA button. */
export function ModalBottomCTA({
  totalCost,
  quantity,
  setQuantity,
  hideQuantityPicker,
  handleAddToCart,
  isEditing,
  ctaLabel,
}: ModalBottomCTAProps) {
  const label = ctaLabel ?? (isEditing ? "Cập nhật" : "Bỏ vào giỏ cá");

  return (
    <div className="fixed md:absolute bottom-0 left-0 md:left-auto right-0 z-[110] w-full md:w-1/2 bg-[#fdfcf7]/95 backdrop-blur-md border-t border-border/60 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] px-4 py-3 pb-8 md:pb-5 md:rounded-br-[2.5rem]">
      <div className="flex min-w-0 items-center gap-2">
        {/* Quantity Adjuster */}
        <div className={cn("flex shrink-0 items-center bg-[#d9e4d4] rounded-2xl overflow-hidden", hideQuantityPicker ? "opacity-60" : "")}>
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={hideQuantityPicker}
            className="w-11 h-11 flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 disabled:active:bg-transparent transition-colors text-primary font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >−</button>
          <span className="text-sm font-bold w-6 text-center text-primary">{quantity}</span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            disabled={hideQuantityPicker}
            className="w-11 h-11 flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 disabled:active:bg-transparent transition-colors text-primary font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >+</button>
        </div>

        {/* Add to Cart Button — price merged in; layout ensures price is never truncated */}
        <button
          onClick={handleAddToCart}
          className="min-w-0 flex-1 flex items-center justify-center gap-1 bg-primary text-white rounded-2xl h-11 px-3 font-bold text-sm shadow-lg active:scale-[0.98] transition-all overflow-hidden"
        >
          <span className="truncate">{label}</span>
          <span className="shrink-0 whitespace-nowrap">- {formatKa(totalCost, "ceil")}</span>
        </button>
      </div>
    </div>
  );
}
