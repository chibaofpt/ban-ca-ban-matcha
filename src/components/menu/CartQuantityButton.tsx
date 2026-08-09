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
  /** Called when badge is pressed and 2+ variants exist. */
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
    if (variantCount >= 2) {
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
      <div
        className="w-9 h-9 rounded-full bg-[#5b9a2b] flex items-center justify-center cursor-pointer active:scale-95 transition-transform shrink-0 shadow-sm"
        onClick={handleAdd}
      >
        <Plus className="text-white" size={20} strokeWidth={3} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      className="flex justify-end shrink-0"
    >
      <motion.div
        initial={false}
        animate={{ width: isExpanded ? 104 : 36 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="h-9 rounded-full bg-white border-2 border-[#5b9a2b] flex items-center overflow-hidden shadow-sm relative"
      >
        {!isExpanded ? (
          <div
            className="w-full h-full flex items-center justify-center cursor-pointer absolute inset-0"
            onClick={handleBadgeClick}
          >
            <span className="text-sm font-bold text-[#5b9a2b] select-none">
              {quantity}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full px-1 min-w-[100px] absolute inset-0">
            <button
              type="button"
              onClick={handleDecrement}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#5b9a2b]/10 active:bg-[#5b9a2b]/20 transition-colors shrink-0"
              aria-label={quantity === 1 ? "Xóa khỏi giỏ" : "Giảm số lượng"}
            >
              {quantity === 1 ? (
                <Trash2 className="text-red-500" size={14} strokeWidth={2.5} />
              ) : (
                <Minus className="text-[#5b9a2b]" size={16} strokeWidth={2.5} />
              )}
            </button>
            <span className="text-sm font-bold text-[#5b9a2b] w-6 text-center select-none shrink-0">
              {quantity}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={quantity >= MAX_QUANTITY}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                quantity >= MAX_QUANTITY
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-[#5b9a2b]/10 active:bg-[#5b9a2b]/20"
              }`}
              aria-label="Tăng số lượng"
            >
              <Plus className="text-[#5b9a2b]" size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
