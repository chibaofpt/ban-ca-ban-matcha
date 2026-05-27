"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/src/lib/types/cart";

interface CartState {
  items: CartItem[];
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addItem: (newItem: Omit<CartItem, "cartId">) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
  clearCart: () => void;
  /**
   * Applies a PRODUCT voucher credit to a cart item.
   * Reduces clientPriceVnd by up to coveredPriceVnd (floor at 0).
   * Stores the original price so it can be restored on voucher removal.
   */
  applyProductVoucher: (cartId: string, voucherId: string, coveredPriceVnd: number) => void;
  /**
   * Removes a PRODUCT voucher from a cart item and restores the original price.
   */
  removeProductVoucher: (cartId: string) => void;
}

/**
 * useCartStore — global shopping cart state managed by Zustand.
 * Persisted to localStorage so the fish stay in the bag after refresh.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isCartOpen: false,
      setCartOpen: (open) => set({ isCartOpen: open }),

      addItem: (newItem) => {
        const { items } = get();
        // Each addition is a unique row with its own cartId — no deduplication.
        const cartId = crypto.randomUUID();
        set({ items: [...items, { ...newItem, cartId }] });
      },

      removeItem: (cartId) => {
        set({
          items: get().items.filter((i) => i.cartId !== cartId),
        });
      },

      updateQuantity: (cartId, quantity) => {
        set({
          items: get().items.map((i) =>
            i.cartId === cartId ? { ...i, quantity: Math.max(1, quantity) } : i
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      applyProductVoucher: (cartId, voucherId, coveredPriceVnd) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            // Always compute from originalClientPriceVnd so swapping vouchers is idempotent.
            const original = i.originalClientPriceVnd;
            const discounted = Math.max(0, original - coveredPriceVnd);
            return {
              ...i,
              productVoucherId: voucherId,
              clientPriceVnd: discounted,
            };
          }),
        });
      },

      removeProductVoucher: (cartId) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            return {
              ...i,
              productVoucherId: undefined,
              clientPriceVnd: i.originalClientPriceVnd,
            };
          }),
        });
      },
    }),
    { name: "bcbm-cart" }
  )
);

/** Computed helpers for easier usage in components */
export const useCartTotalItems = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

export const useCartTotalPrice = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.clientPriceVnd * i.quantity, 0));
