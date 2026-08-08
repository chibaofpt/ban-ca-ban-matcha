"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/src/lib/types/cart";
import { addBusinessBreadcrumb } from "@/src/lib/observability";

export function computeFinalClientPrice(item: CartItem): number {
  const baseDrinkPrice = item.unitPrice - item.addonsPrice;
  const voucherCredit = item.productVoucherDiscountVnd ?? 0;
  
  // PRODUCT credit caps at drink price — never spills into addon
  const drinkAfterCredit = Math.max(0, baseDrinkPrice - voucherCredit);
  
  // ADDON voucher discounts apply independently
  const addonDiscount = item.addonVouchers?.reduce((sum, v) => sum + v.discountVnd, 0) ?? 0;
  const finalAddonsPrice = Math.max(0, item.addonsPrice - addonDiscount);
  
  return drinkAfterCredit + finalAddonsPrice;
}

interface CartState {
  items: CartItem[];
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addItem: (newItem: Omit<CartItem, "cartId">) => string;
  removeItem: (cartId: string) => void;
  updateItem: (cartId: string, updates: Partial<CartItem>) => void;
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
  removeAddonVoucher: (cartId: string, voucherId: string) => void;
  selectedVoucherIds: string[];
  setSelectedVoucherIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}

type PersistedCartState = Partial<Pick<CartState, "items" | "isCartOpen" | "selectedVoucherIds">>;

/** Migrate persisted cart data while retaining items and removing legacy voucher identifiers. */
export function migrateCartState(
  persistedState: unknown,
  fromVersion: number,
): PersistedCartState {
  const old = persistedState as PersistedCartState;
  if (!old.items) return old;

  const sizeMap: Record<string, import("@/src/lib/types/menu").Size> = {
    M: "SMALL",
    L: "MEDIUM",
    XL: "LARGE",
  };

  old.items = old.items.map((item) => {
    const sizedItem = fromVersion < 2
      ? { ...item, size: sizeMap[item.size] ?? "SMALL" }
      : item;
    if (fromVersion >= 3) return sizedItem;

    return {
      ...sizedItem,
      clientPriceVnd: sizedItem.originalClientPriceVnd ?? sizedItem.unitPrice,
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      addonVouchers: [],
    };
  });

  if (fromVersion < 3) old.selectedVoucherIds = [];
  return old;
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
      selectedVoucherIds: [],
      setCartOpen: (open) => set({ isCartOpen: open }),
      setSelectedVoucherIds: (ids) => set({ 
        selectedVoucherIds: typeof ids === "function" ? ids(get().selectedVoucherIds) : ids 
      }),

      addItem: (newItem) => {
        const cartId = crypto.randomUUID();
        const fullItem: CartItem = { ...newItem, cartId };
        set((state) => ({ items: [...state.items, fullItem] }));
        addBusinessBreadcrumb("cart.add", {
          category: newItem.category,
          quantity: newItem.quantity,
        });
        return cartId;
      },

      removeItem: (cartId) => {
        set({
          items: get().items.filter((i) => i.cartId !== cartId),
        });
        addBusinessBreadcrumb("cart.remove", {
          remaining_items: get().items.length,
        });
      },

      updateItem: (cartId, updates) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            return { ...i, ...updates };
          }),
        });
      },

      updateQuantity: (cartId, quantity) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            // Prevent increasing quantity for items with vouchers
            if ((i.productVoucherId || (i.addonVouchers && i.addonVouchers.length > 0)) && quantity > 1) {
              return i;
            }
            return { ...i, quantity: Math.max(1, quantity) };
          }),
        });
      },

      clearCart: () => set({ items: [] }),

      applyProductVoucher: (cartId, voucherId, coveredPriceVnd) => {
        const currentItems = get().items.map((i) => {
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
          addBusinessBreadcrumb("voucher.apply", { voucher_type: "PRODUCT" });
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
        addBusinessBreadcrumb("voucher.apply", { voucher_type: "PRODUCT" });
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
        addBusinessBreadcrumb("voucher.remove", { voucher_type: "PRODUCT" });
      },

      applyAddonVoucher: (cartId, voucherId, addonOptionId) => {
        const currentItems = get().items.map((i) => {
          if (i.addonVouchers?.some(v => v.voucherId === voucherId)) {
            const nextI = { ...i, addonVouchers: i.addonVouchers.filter(v => v.voucherId !== voucherId) };
            nextI.clientPriceVnd = computeFinalClientPrice(nextI);
            return nextI;
          }
          return i;
        });

        const itemIndex = currentItems.findIndex((i) => i.cartId === cartId);
        if (itemIndex === -1) return;

        const item = currentItems[itemIndex];
        
        const newAddonVouchers = item.addonVouchers ? [...item.addonVouchers] : [];
        const existingIdx = newAddonVouchers.findIndex(v => v.addonOptionId === addonOptionId);
        
        const toppingPrice = item.addonPrices?.[addonOptionId] ?? 0;
        const newVoucher = { voucherId, addonOptionId, discountVnd: toppingPrice };

        if (existingIdx !== -1) {
          newAddonVouchers[existingIdx] = newVoucher;
        } else {
          newAddonVouchers.push(newVoucher);
        }

        const nextItem = { ...item, addonVouchers: newAddonVouchers };
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

      removeAddonVoucher: (cartId, voucherId) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            if (!i.addonVouchers) return i;
            const nextItem = { ...i, addonVouchers: i.addonVouchers.filter(v => v.voucherId !== voucherId) };
            nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);
            return nextItem;
          }),
        });
      },
    }),
    {
      name: "bcbm-cart",
      version: 3,
      /**
       * Auto-migrate old localStorage cart data:
       * Size M → SMALL, L → MEDIUM, XL → LARGE (Big-Bang strategy).
       * Runs once when version upgrades from <2 to 2.
       */
      migrate: migrateCartState,
    }
  )
);

/** Computed helpers for easier usage in components */
export const useCartTotalItems = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

export const useCartTotalPrice = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.clientPriceVnd * i.quantity, 0));
