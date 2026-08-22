"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/src/lib/types/cart";
import { addBusinessBreadcrumb } from "@/src/lib/observability";

export function computeFinalClientPrice(item: CartItem): number {
  if (item.category === "extras") {
    return item.itemVoucherId ? 0 : item.unitPrice;
  }
  const baseDrinkPrice = item.unitPrice - item.addonsPrice;
  const voucherCredit = item.productVoucherDiscountVnd ?? 0;
  
  // PRODUCT credit caps at drink price — never spills into addon
  const drinkAfterCredit = Math.max(0, baseDrinkPrice - voucherCredit);
  
  // ADDON voucher discounts apply independently
  const addonDiscount = item.addonVouchers?.reduce((sum, v) => sum + v.discountVnd, 0) ?? 0;
  const finalAddonsPrice = Math.max(0, item.addonsPrice - addonDiscount);
  
  return drinkAfterCredit + finalAddonsPrice;
}

/** Release one voucher token from every cart line except its new target line. */
export function releaseVoucherFromOtherCartLines(
  items: CartItem[],
  voucherId: string,
  targetCartId: string | null,
): CartItem[] {
  return items.map((item) => {
    if (
      item.cartId === targetCartId ||
      (item.productVoucherId !== voucherId && item.itemVoucherId !== voucherId)
    ) {
      return item;
    }
    const released = {
      ...item,
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      itemVoucherId: undefined,
    };
    return { ...released, clientPriceVnd: computeFinalClientPrice(released) };
  });
}

function normalizeUniqueCartVouchers(items: CartItem[]): CartItem[] {
  const ownerByVoucher = new Map<string, string>();
  for (const item of items) {
    const voucherId = item.itemVoucherId ?? item.productVoucherId;
    if (voucherId) ownerByVoucher.set(voucherId, item.cartId);
  }
  return items.map((item) => {
    const voucherId = item.itemVoucherId ?? item.productVoucherId;
    if (!voucherId || ownerByVoucher.get(voucherId) === item.cartId) return item;
    const released = {
      ...item,
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      itemVoucherId: undefined,
    };
    return { ...released, clientPriceVnd: computeFinalClientPrice(released) };
  });
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
  selectedBundleToken: string | null;
  bundleAllocations: import("@/src/lib/utils/bundleVoucher").BundleSelectionAllocation[];
  setSelectedBundleToken: (token: string | null) => void;
  setBundleAllocations: (allocations: import("@/src/lib/utils/bundleVoucher").BundleSelectionAllocation[]) => void;
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
      ? { ...item, size: item.size ? (sizeMap[item.size] ?? "SMALL") : null }
      : item;
    const voucherSafeItem = fromVersion < 3 ? {
      ...sizedItem,
      clientPriceVnd: sizedItem.originalClientPriceVnd ?? sizedItem.unitPrice,
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      addonVouchers: [],
    } : sizedItem;
    const baseLiquidSafeItem = fromVersion < 5 && voucherSafeItem.selectedMilkTypeId
      ? { ...voucherSafeItem, selectedBaseLiquidId: voucherSafeItem.selectedMilkTypeId }
      : voucherSafeItem;
    const itemVoucherSafeItem = fromVersion < 6 && baseLiquidSafeItem.itemVoucherId
      ? {
          ...baseLiquidSafeItem,
          itemVoucherId: undefined,
          clientPriceVnd: baseLiquidSafeItem.originalClientPriceVnd ?? baseLiquidSafeItem.unitPrice,
        }
      : baseLiquidSafeItem;
    if (fromVersion >= 4) return itemVoucherSafeItem;

    if (itemVoucherSafeItem.size === null) return itemVoucherSafeItem;
    const retainedOptionIds = itemVoucherSafeItem.selectedOptionIds.filter(
      (optionId) => (itemVoucherSafeItem.addonPrices[optionId] ?? 0) > 0,
    );
    const retainedOptionIdSet = new Set([
      ...retainedOptionIds,
      ...itemVoucherSafeItem.quantityAddonOptions.map((option) => option.option_id),
    ]);
    const retainedPrices = Object.fromEntries(
      Object.entries(itemVoucherSafeItem.addonPrices).filter(
        ([optionId, price]) => price > 0 || retainedOptionIdSet.has(optionId),
      ),
    );
    return {
      ...itemVoucherSafeItem,
      selectedOptionIds: retainedOptionIds,
      addonPrices: retainedPrices,
      addonVouchers: itemVoucherSafeItem.addonVouchers?.filter(
        (voucher) => retainedOptionIdSet.has(voucher.addonOptionId),
      ),
    };
  });

  old.items = normalizeUniqueCartVouchers(old.items);

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
      selectedBundleToken: null,
      bundleAllocations: [],
      setCartOpen: (open) => set({ isCartOpen: open }),
      setSelectedVoucherIds: (ids) => set({ 
        selectedVoucherIds: typeof ids === "function" ? ids(get().selectedVoucherIds) : ids 
      }),
      setSelectedBundleToken: (token) => set({ selectedBundleToken: token }),
      setBundleAllocations: (allocations) => set({ bundleAllocations: allocations }),

      addItem: (newItem) => {
        const cartId = crypto.randomUUID();
        const fullItem: CartItem = { ...newItem, cartId };
        set((state) => ({
          items: [
            ...(newItem.itemVoucherId
              ? releaseVoucherFromOtherCartLines(state.items, newItem.itemVoucherId, null)
              : state.items),
            fullItem,
          ],
        }));
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
          items: (updates.itemVoucherId
            ? releaseVoucherFromOtherCartLines(get().items, updates.itemVoucherId, cartId)
            : get().items).map((i) => {
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
            if ((i.productVoucherId || i.itemVoucherId || (i.addonVouchers && i.addonVouchers.length > 0)) && quantity > 1) {
              return i;
            }
            return { ...i, quantity: Math.max(1, quantity) };
          }),
        });
      },

      clearCart: () => set({ items: [] }),

      applyProductVoucher: (cartId, voucherId, coveredPriceVnd) => {
        const currentItems = get().items.map((i) => {
          if (i.productVoucherId === voucherId || i.itemVoucherId === voucherId) {
            const nextI = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined, itemVoucherId: undefined };
            nextI.clientPriceVnd = computeFinalClientPrice(nextI);
            return nextI;
          }
          return i;
        });

        const itemIndex = currentItems.findIndex((i) => i.cartId === cartId);
        if (itemIndex === -1) return;

        const item = currentItems[itemIndex];
        const isItemVoucher = item.category === "extras";
        const nextItem = {
          ...item,
          productVoucherId: isItemVoucher ? undefined : voucherId,
          productVoucherDiscountVnd: isItemVoucher ? undefined : coveredPriceVnd,
          itemVoucherId: isItemVoucher ? voucherId : undefined,
        };
        const discounted = computeFinalClientPrice(nextItem);
        nextItem.clientPriceVnd = discounted;

        if (item.quantity === 1) {
          currentItems[itemIndex] = nextItem;
          set({ items: currentItems });
          addBusinessBreadcrumb("voucher.apply", { voucher_type: isItemVoucher ? "ITEM" : "PRODUCT" });
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
        addBusinessBreadcrumb("voucher.apply", { voucher_type: isItemVoucher ? "ITEM" : "PRODUCT" });
      },

      removeProductVoucher: (cartId) => {
        set({
          items: get().items.map((i) => {
            if (i.cartId !== cartId) return i;
            const nextItem = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined, itemVoucherId: undefined };
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
      version: 7,
      /**
       * Auto-migrate old localStorage cart data:
       * Size M → SMALL, L → MEDIUM, XL → LARGE (Big-Bang strategy).
       * Runs once when version upgrades from <2 to 2.
       */
      migrate: migrateCartState,
      partialize: (state) => ({
        items: state.items.filter((item) => !item.bundleRewardVoucherToken && !item.bundleQualifierVoucherToken),
        isCartOpen: state.isCartOpen,
        selectedVoucherIds: state.selectedVoucherIds,
      }),
    }
  )
);

/** Computed helpers for easier usage in components */
export const useCartTotalItems = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

export const useCartTotalPrice = () =>
  useCartStore((s) => s.items.reduce((sum, i) => sum + i.clientPriceVnd * i.quantity, 0));
