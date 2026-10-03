"use client";

import React from "react";
import { ShoppingCart } from "lucide-react";
import { motion, useAnimation } from "framer-motion";
import { useCartStore, useCartTotalItems } from "@/src/lib/store/cartStore";
import { formatCartMoney } from "@/src/utils/display";
import { CartMoney } from "@/src/components/shared/CartMoney";

/**
 * CartButton is a floating action button that displays the cart total and item count.
 * Updated with premium styling and UIProvider connection.
 */
const CartButton: React.FC<{ totalPriceVnd: number }> = ({ totalPriceVnd }) => {
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const count = useCartTotalItems();
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      controls.start({
        scale: [1, 1.2, 0.9, 1.1, 1],
        transition: { duration: 0.25 }
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-30 flex max-w-[calc(100vw-2rem)] justify-end md:bottom-6 md:right-6 lg:hidden">
      <motion.button
        type="button"
        onClick={() => setCartOpen(true)}
        animate={controls}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Mở giỏ hàng, ${formatCartMoney(totalPriceVnd)} cho ${count} món`}
      >
        <ShoppingCart className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-medium">{count} món • <CartMoney amountVnd={totalPriceVnd} /></span>
      </motion.button>
    </div>
  );
};

export default CartButton;
