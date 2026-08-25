"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Minus, Trash2 } from "lucide-react";

interface CartQuantityButtonProps {
  /** Total quantity of this menu item across all variants in cart. */
  quantity: number;
  /** Number of distinct variants (cart entries) for this menu item. */
  variantCount: number;
  /** True if any variant has a product or addon voucher applied. */
  hasVoucher: boolean;
  /** Called when "+" is pressed and item is not yet in cart. */
  onAdd: () => void;
  /** Called when inline editing is unsafe because variants or vouchers exist. */
  onOpenVariants: () => void;
  /** Called to increase quantity by 1 (single variant inline stepper). */
  onIncrement: () => void;
  /** Called to decrease quantity by 1 (single variant, qty > 1). */
  onDecrement: () => void;
  /** Called to remove item (single variant, qty was 1 → 0). */
  onRemove: () => void;
}

const MAX_QUANTITY = 10;
const AUTO_COLLAPSE_MS = 5000;

/** Reusable add-to-cart / quantity stepper button for menu product cards. */
export const CartQuantityButton: React.FC<CartQuantityButtonProps> = ({
  quantity,
  variantCount,
  hasVoucher,
  onAdd,
  onOpenVariants,
  onIncrement,
  onDecrement,
  onRemove,
}) => {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived: stepper only visible when expanded AND item exists in cart
  const isExpanded = expanded && quantity > 0;

  // Auto-collapse timer — resets whenever quantity changes (user taps +/−)
  useEffect(() => {
    if (!isExpanded) return;
    const id = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(id);
  }, [isExpanded, quantity]);

  // Collapse on click outside
  useEffect(() => {
    if (!isExpanded) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [isExpanded]);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAdd();
  };

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (variantCount >= 2 || hasVoucher) {
      onOpenVariants();
    } else if (variantCount === 1 && !hasVoucher) {
      setExpanded(true);
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quantity < MAX_QUANTITY) onIncrement();
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quantity === 1) {
      setExpanded(false);
      onRemove();
    } else {
      onDecrement();
    }
  };

  if (quantity === 0) {
    return (
      <button
        type="button"
        aria-label="Thêm món vào giỏ"
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#5b9a2b] shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9a2b] focus-visible:ring-offset-2"
        onClick={handleAdd}
      >
        <Plus className="text-white" size={14} strokeWidth={3} />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      className="flex shrink-0 justify-end"
    >
      <motion.div
        initial={false}
        animate={{ width: isExpanded ? 76 : 36 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="flex h-9 items-center overflow-hidden rounded-full border-2 border-[#5b9a2b] bg-white shadow-sm"
      >
        {!isExpanded ? (
          <button
            type="button"
            aria-label="Mở điều khiển số lượng"
            className="flex h-full w-full cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9a2b]"
            onClick={handleBadgeClick}
          >
            <span className="text-sm font-bold text-[#5b9a2b] select-none">
              {quantity}
            </span>
          </button>
        ) : (
          <div className="flex w-full items-center justify-between px-0.5">
            <button
              type="button"
              onClick={handleDecrement}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#5b9a2b]/10 active:bg-[#5b9a2b]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9a2b]"
              aria-label={quantity === 1 ? "Xóa khỏi giỏ" : "Giảm số lượng"}
            >
              {quantity === 1 ? (
                <Trash2 className="text-red-500" size={10} strokeWidth={2.5} />
              ) : (
                <Minus className="text-[#5b9a2b]" size={11} strokeWidth={2.5} />
              )}
            </button>
            <span className="w-3 shrink-0 select-none text-center text-[11px] font-bold text-[#5b9a2b]">
              {quantity}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={quantity >= MAX_QUANTITY}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9a2b] ${
                quantity >= MAX_QUANTITY
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-[#5b9a2b]/10 active:bg-[#5b9a2b]/20"
              }`}
              aria-label="Tăng số lượng"
            >
              <Plus className="text-[#5b9a2b]" size={11} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
