"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/src/lib/types/cart";

function computeFinalClientPrice(item: CartItem): number {
  const baseDrinkPrice = item.unitPrice - item.addonsPrice;
  const voucherCredit = item.productVoucherDiscountVnd ?? 0;
  
  const drinkAfterCredit = Math.max(0, baseDrinkPrice - voucherCredit);
  const remainingCredit = Math.max(0, voucherCredit - baseDrinkPrice);
  
  const addonsAfterCredit = Math.max(0, item.addonsPrice - remainingCredit);
  const addonDiscount = item.addonVoucherDiscountVnd ?? 0;
  
  const finalAddonsPrice = Math.max(0, addonsAfterCredit - addonDiscount);
  
  return drinkAfterCredit + finalAddonsPrice;
}

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
  applyAddonVoucher: (cartId: string, voucherId: string, addonOptionId: string) => void;
  removeAddonVoucher: (cartId: string) => void;
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
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            // Prevent increasing quantity for items with vouchers
            if ((i.productVoucherId || i.addonVoucherId) && quantity > 1) {
              return i;
            }
            return { ...i, quantity: Math.max(1, quantity) };
          }),
        });
      },

      clearCart: () => set({ items: [] }),

      applyProductVoucher: (cartId, voucherId, coveredPriceVnd) => {
        let currentItems = get().items.map((i) => {
          if (i.productVoucherId === voucherId) {
            const nextI = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined };
            nextI.clientPriceVnd = computeFinalClientPrice(nextI);
            return nextI;
          }
          return i;
        });

        const itemIndex = currentItems.findIndex((i) => i.cartId === cartId);
        if (itemIndex === -1) return;

        const item = currentItems[itemIndex];
        const nextItem = { ...item, productVoucherId: voucherId, productVoucherDiscountVnd: coveredPriceVnd };
        const discounted = computeFinalClientPrice(nextItem);
        nextItem.clientPriceVnd = discounted;

        if (item.quantity === 1) {
          currentItems[itemIndex] = nextItem;
          set({ items: currentItems });
          return;
        }

        // Split the item if quantity > 1
        const newItem = {
          ...nextItem,
          cartId: crypto.randomUUID(),
          quantity: 1,
        };

        currentItems[itemIndex] = { ...item, quantity: item.quantity - 1 };
        currentItems.splice(itemIndex + 1, 0, newItem);

        set({ items: currentItems });
      },

      removeProductVoucher: (cartId) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            const nextItem = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined };
            nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);
            return nextItem;
          }),
        });
      },

      applyAddonVoucher: (cartId, voucherId, addonOptionId) => {
        let currentItems = get().items.map((i) => {
          if (i.addonVoucherId === voucherId) {
            const nextI = { ...i, addonVoucherId: undefined, addonVoucherDiscountVnd: undefined };
            nextI.clientPriceVnd = computeFinalClientPrice(nextI);
            return nextI;
          }
          return i;
        });

        const itemIndex = currentItems.findIndex((i) => i.cartId === cartId);
        if (itemIndex === -1) return;

        const item = currentItems[itemIndex];
        const toppingPrice = item.addonPrices?.[addonOptionId] ?? 0;
        const nextItem = { ...item, addonVoucherId: voucherId, addonVoucherDiscountVnd: toppingPrice };
        const discounted = computeFinalClientPrice(nextItem);
        nextItem.clientPriceVnd = discounted;

        if (item.quantity === 1) {
          currentItems[itemIndex] = nextItem;
          set({ items: currentItems });
          return;
        }

        // Split the item if quantity > 1
        const newItem = {
          ...nextItem,
          cartId: crypto.randomUUID(),
          quantity: 1,
        };

        currentItems[itemIndex] = { ...item, quantity: item.quantity - 1 };
        currentItems.splice(itemIndex + 1, 0, newItem);

        set({ items: currentItems });
      },

      removeAddonVoucher: (cartId) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            const nextItem = { ...i, addonVoucherId: undefined, addonVoucherDiscountVnd: undefined };
            nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);
            return nextItem;
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
