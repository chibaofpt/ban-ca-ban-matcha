import React from "react";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/src/utils/cn";

interface ModalBottomCTAProps {
  totalCost: number;
  quantity: number;
  setQuantity: (qty: number) => void;
  hideQuantityPicker: boolean;
  handleAddToCart: () => void;
  isEditing: boolean;
}

export function ModalBottomCTA({
  totalCost,
  quantity,
  setQuantity,
  hideQuantityPicker,
  handleAddToCart,
  isEditing
}: ModalBottomCTAProps) {
  return (
    <div className="fixed md:absolute bottom-0 left-0 md:left-auto right-0 z-[110] w-full md:w-1/2 bg-[#fdfcf7]/95 backdrop-blur-md border-t border-border/60 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] px-5 py-4 pb-8 md:pb-6 md:rounded-br-[2.5rem]">
      <div className="flex items-center justify-between gap-3">
        {/* Total price */}
        <div className="flex flex-col items-start justify-center flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary/45">Tổng tiền</span>
          <span className="font-serif font-bold text-lg md:text-xl text-primary leading-none mt-0.5 whitespace-nowrap">
            {totalCost / 1000} ká
          </span>
        </div>

        {/* Quantity Adjuster */}
        <div className={cn("flex items-center bg-[#d9e4d4] rounded-2xl overflow-hidden shrink-0", hideQuantityPicker ? "opacity-60" : "")}>
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={hideQuantityPicker}
            className="w-9 md:w-10 h-11 flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 disabled:active:bg-transparent transition-colors text-primary font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >−</button>
          <span className="text-sm font-bold w-6 text-center text-primary">{quantity}</span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            disabled={hideQuantityPicker}
            className="w-9 md:w-10 h-11 flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 disabled:active:bg-transparent transition-colors text-primary font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >+</button>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          className="bg-primary text-white rounded-2xl h-11 px-4 md:px-5 font-bold text-sm shadow-lg active:scale-[0.98] transition-all flex items-center gap-2 shrink-0"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{isEditing ? 'Cập nhật' : 'Bỏ giỏ cá'}</span>
        </button>
      </div>
    </div>
  );
}
