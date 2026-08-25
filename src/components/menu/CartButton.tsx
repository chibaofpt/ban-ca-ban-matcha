"use client";

import React from "react";
import { ShoppingBag } from "lucide-react";
import { motion, useAnimation } from "framer-motion";
import { useCartStore, useCartTotalItems, useCartTotalPrice } from "@/src/lib/store/cartStore";
import { formatKa } from "@/src/utils/display";

/**
 * CartButton is a floating action button that displays the cart total and item count.
 * Updated with premium styling and UIProvider connection.
 */
const CartButton: React.FC = () => {
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const count = useCartTotalItems();
  const totalPrice = useCartTotalPrice();
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      controls.start({
        scale: [1, 1.2, 0.9, 1.1, 1],
        transition: { duration: 0.5 }
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center lg:hidden">
      <motion.button
        onClick={() => setCartOpen(true)}
        animate={controls}
        className="group pointer-events-auto flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary/90 px-5 text-primary-foreground shadow-2xl backdrop-blur-sm transition-all hover:scale-105 active:scale-95"
        aria-label={`Mở giỏ hàng, ${formatKa(totalPrice)} cho ${count} món`}
      >
        <ShoppingBag className="h-5 w-5 shrink-0 transition-transform group-hover:rotate-12" />
        <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-primary-foreground/80">
          <span>Giỏ đang có</span>
          <span className="text-base font-extrabold text-white">
            {formatKa(totalPrice)}
          </span>
          <span>cho</span>
          <span className="text-base font-extrabold text-white">
            {count} món
          </span>
        </span>
      </motion.button>
    </div>
  );
};

export default CartButton;
