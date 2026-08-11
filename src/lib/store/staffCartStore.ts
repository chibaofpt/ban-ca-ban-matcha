import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/src/lib/types/cart";
import { computeFinalClientPrice } from "./cartStore";
import type { CustomerInfo } from "@/src/components/staff/CustomerSelectModal";

export interface DiscountVoucher {
  qr_token: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
}

interface StaffCartState {
  items: CartItem[];
  customerInfo: CustomerInfo | null;
  discountVoucher: DiscountVoucher | null;
  selectedDiscountIds: string[];
  
  addItem: (newItem: Omit<CartItem, "cartId">) => void;
  insertItemAfter: (targetCartId: string, newItem: Omit<CartItem, "cartId">) => void;
  removeItem: (cartId: string) => void;
  updateItem: (cartId: string, updates: Partial<CartItem>) => void;
  updateQuantity: (cartId: string, quantity: number) => void;
  clearCart: () => void;
  
  setCustomerInfo: (info: CustomerInfo | null) => void;
  setDiscountVoucher: (voucher: DiscountVoucher | null) => void;
  setSelectedDiscountIds: (ids: string[]) => void;
  toggleDiscountId: (id: string) => void;

  applyProductVoucher: (cartId: string, voucherId: string, coveredPriceVnd: number) => void;
  removeProductVoucher: (cartId: string) => void;
  applyAddonVoucher: (cartId: string, voucherId: string, addonOptionId: string) => void;
  removeAddonVoucher: (cartId: string, voucherId: string) => void;
}

type PersistedStaffCartState = Partial<StaffCartState>;

/** Remove legacy zero-price sentinel addons from persisted staff carts. */
export function migrateStaffCartState(persistedState: unknown): PersistedStaffCartState {
  const old = persistedState as PersistedStaffCartState;
  if (!old.items) return old;
  return {
    ...old,
    items: old.items.map((item) => {
      const selectedOptionIds = item.selectedOptionIds.filter(
        (optionId) => (item.addonPrices[optionId] ?? 0) > 0,
      );
      const selectedOptionIdSet = new Set([
        ...selectedOptionIds,
        ...item.quantityAddonOptions.map((option) => option.option_id),
      ]);
      return {
        ...item,
        selectedOptionIds,
        addonPrices: Object.fromEntries(
          Object.entries(item.addonPrices).filter(
            ([optionId, price]) => price > 0 || selectedOptionIdSet.has(optionId),
          ),
        ),
        addonVouchers: item.addonVouchers?.filter(
          (voucher) => selectedOptionIdSet.has(voucher.addonOptionId),
        ),
      };
    }),
  };
}

export const useStaffCartStore = create<StaffCartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerInfo: null,
      discountVoucher: null,
      selectedDiscountIds: [],

      setCustomerInfo: (info) => {
        const currentInfo = get().customerInfo;
        const isSameCustomer = currentInfo?.type === "existing" && info?.type === "existing" && currentInfo.data.qr_token === info.data.qr_token;
        set({ customerInfo: info });
        
        if (!isSameCustomer) {
          // Clear voucher selections when customer changes
          set({ selectedDiscountIds: [], discountVoucher: null });
          // Remove applied vouchers from existing cart
          set({
            items: get().items.map((i) => {
              const next = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined, addonVouchers: [] };
              next.clientPriceVnd = computeFinalClientPrice(next);
              return next;
            })
          });
        }
      },
      setDiscountVoucher: (voucher) => set({ discountVoucher: voucher }),
      setSelectedDiscountIds: (ids) => set({ selectedDiscountIds: ids }),
      toggleDiscountId: (id) => set({
        selectedDiscountIds: get().selectedDiscountIds.includes(id)
          ? get().selectedDiscountIds.filter(vId => vId !== id)
          : [...get().selectedDiscountIds, id]
      }),

      addItem: (newItem) => {
        const { items } = get();
        const cartId = crypto.randomUUID();
        set({ items: [...items, { ...newItem, cartId }] });
      },

      insertItemAfter: (targetCartId, newItem) => {
        const { items } = get();
        const targetIndex = items.findIndex((i) => i.cartId === targetCartId);
        if (targetIndex === -1) {
          get().addItem(newItem);
          return;
        }
        const cartId = crypto.randomUUID();
        const newItems = [...items];
        newItems.splice(targetIndex + 1, 0, { ...newItem, cartId });
        set({ items: newItems });
      },

      removeItem: (cartId) => {
        set({
          items: get().items.filter((i) => i.cartId !== cartId),
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
            if ((i.productVoucherId || (i.addonVouchers && i.addonVouchers.length > 0)) && quantity > 1) {
              return i;
            }
            return { ...i, quantity: Math.max(1, quantity) };
          }),
        });
      },

      clearCart: () => set({
        items: [],
        discountVoucher: null,
        selectedDiscountIds: [],
        customerInfo: null,
      }),

      applyProductVoucher: (cartId, voucherId, coveredPriceVnd) => {
        const currentItems = get().items.map((i) => {
          if (i.productVoucherId === voucherId) {
            const nextI = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined };
            nextI.clientPriceVnd = computeFinalClientPrice(nextI);
            return nextI;
          }
          return i;
        });

        const itemIndex = currentItems.findIndex((c) => c.cartId === cartId);
        if (itemIndex === -1) {
          set({ items: currentItems });
          return;
        }

        const item = currentItems[itemIndex];
        const nextItem = { 
          ...item, 
          productVoucherId: voucherId, 
          productVoucherDiscountVnd: coveredPriceVnd 
        };
        nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);

        if (item.quantity === 1) {
          currentItems[itemIndex] = nextItem;
        } else {
          // Split item logic
          const newItem = {
            ...nextItem,
            cartId: crypto.randomUUID(),
            quantity: 1,
          };
          currentItems[itemIndex] = { ...item, quantity: item.quantity - 1 };
          currentItems.splice(itemIndex + 1, 0, newItem);
        }
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
        const currentItems = get().items.map((i) => {
          if (i.addonVouchers?.some(v => v.voucherId === voucherId)) {
            const nextI = { ...i, addonVouchers: i.addonVouchers.filter(v => v.voucherId !== voucherId) };
            nextI.clientPriceVnd = computeFinalClientPrice(nextI);
            return nextI;
          }
          return i;
        });

        const itemIndex = currentItems.findIndex((c) => c.cartId === cartId);
        if (itemIndex === -1) {
          set({ items: currentItems });
          return;
        }

        const item = currentItems[itemIndex];
        const addonPrices = item.addonPrices || {};
        const discountVnd = addonPrices[addonOptionId] || 0;

        const currentAddonVouchers = item.addonVouchers || [];
        const nextItem = {
          ...item,
          addonVouchers: [...currentAddonVouchers, { voucherId, addonOptionId, discountVnd }]
        };
        nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);

        if (item.quantity === 1) {
          currentItems[itemIndex] = nextItem;
        } else {
          const newItem = {
            ...nextItem,
            cartId: crypto.randomUUID(),
            quantity: 1,
          };
          currentItems[itemIndex] = { ...item, quantity: item.quantity - 1 };
          currentItems.splice(itemIndex + 1, 0, newItem);
        }
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
    { name: "bcbm-staff-cart", version: 1, migrate: migrateStaffCartState }
  )
);

export const useStaffCartTotalItems = () =>
  useStaffCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

export const useStaffCartTotalPrice = () =>
  useStaffCartStore((s) => s.items.reduce((sum, i) => sum + i.clientPriceVnd * i.quantity, 0));
