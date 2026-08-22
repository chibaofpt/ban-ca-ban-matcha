import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BundleApplicationStatus, CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import { computeFinalClientPrice, markBundleApplicationsUnavailableState, releaseVoucherFromOtherCartLines, removeBundleEffects } from "./cartStore";
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
  
  addItem: (newItem: Omit<CartItem, "cartId">) => string;
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
  bundleApplications: CartBundleApplication[];
  commitBundleApplication: (application: CartBundleApplication) => void;
  removeBundleApplication: (voucherToken: string) => void;
  clearBundleApplications: () => void;
  reconcileBundleApplications: (ownerKey: string | null) => void;
  setBundleApplicationStatus: (voucherToken: string, status: BundleApplicationStatus, message?: string) => void;
  markBundleApplicationsVerifyFailed: (message: string) => void;
  markBundleApplicationsUnavailable: (message: string, voucherTokens: string[]) => void;
}

type PersistedStaffCartState = Partial<StaffCartState>;

/** Remove legacy zero-price sentinel addons from persisted staff carts. */
export function migrateStaffCartState(persistedState: unknown, fromVersion = 0): PersistedStaffCartState {
  const old = persistedState as PersistedStaffCartState;
  if (!old.items) return old;
  const migrated = {
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
        selectedBaseLiquidId: item.selectedBaseLiquidId ?? item.selectedMilkTypeId,
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
  const voucherOwners = new Map<string, string>();
  for (const item of migrated.items ?? []) {
    const voucherId = item.itemVoucherId ?? item.productVoucherId;
    if (voucherId) voucherOwners.set(voucherId, item.cartId);
  }
  migrated.items = (migrated.items ?? []).map((item) => {
    const voucherId = item.itemVoucherId ?? item.productVoucherId;
    if (!voucherId || voucherOwners.get(voucherId) === item.cartId) return item;
    const released = {
      ...item,
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      itemVoucherId: undefined,
    };
    return { ...released, clientPriceVnd: computeFinalClientPrice(released) };
  });
  if (fromVersion < 4) {
    migrated.items = migrated.items.map((item) => ({
      ...item,
      bundleQualifierVoucherToken: undefined,
      bundleRewardVoucherToken: undefined,
    }));
    migrated.bundleApplications = [];
  }
  return migrated;
}

export const useStaffCartStore = create<StaffCartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerInfo: null,
      discountVoucher: null,
      selectedDiscountIds: [],
      bundleApplications: [],

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
              const next = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined, itemVoucherId: undefined, addonVouchers: [] };
              next.clientPriceVnd = computeFinalClientPrice(next);
              return next;
            })
          });
          const bundleApplications = get().bundleApplications;
          set({
            items: bundleApplications.reduce((items, application) => removeBundleEffects(items, application), get().items),
            bundleApplications: [],
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
      commitBundleApplication: (application) => set((state) => {
        const previous = state.bundleApplications.find((item) => item.voucher_qr_token === application.voucher_qr_token);
        const retainedEffects = new Set(application.created_reward_effects.map((effect) => effect.kind === "LINE" ? `LINE:${effect.client_line_id}` : `ADDON:${effect.client_line_id}:${effect.addon_option_id}`));
        const stalePrevious = previous ? {
          ...previous,
          created_reward_effects: previous.created_reward_effects.filter((effect) => !retainedEffects.has(effect.kind === "LINE" ? `LINE:${effect.client_line_id}` : `ADDON:${effect.client_line_id}:${effect.addon_option_id}`)),
        } : null;
        return {
          items: stalePrevious ? removeBundleEffects(state.items, stalePrevious) : state.items,
          bundleApplications: [...state.bundleApplications.filter((item) => item.voucher_qr_token !== application.voucher_qr_token), { ...application, status: application.status ?? "REVALIDATING" }],
        };
      }),
      removeBundleApplication: (voucherToken) => set((state) => {
        const application = state.bundleApplications.find((item) => item.voucher_qr_token === voucherToken);
        return application ? {
          items: removeBundleEffects(state.items, application),
          bundleApplications: state.bundleApplications.filter((item) => item.voucher_qr_token !== voucherToken),
        } : {};
      }),
      clearBundleApplications: () => set((state) => ({
        items: state.bundleApplications.reduce((items, application) => removeBundleEffects(items, application), state.items),
        bundleApplications: [],
      })),
      reconcileBundleApplications: (ownerKey) => set((state) => {
        const invalid = state.bundleApplications.filter((application) => !ownerKey || application.owner_key !== ownerKey);
        const lineIds = new Set(state.items.map((item) => item.cartId));
        const retained = state.bundleApplications
          .filter((application) => !invalid.includes(application))
          .map((application) => {
            if (application.status === "UNAVAILABLE" || application.status === "VERIFY_FAILED") return application;
            const hasMissingLine = [...application.qualifier_allocations, ...application.reward_allocations]
              .some((allocation) => !lineIds.has(allocation.client_line_id));
            return hasMissingLine
              ? { ...application, status: "CONFLICT" as const, message: "Giỏ đã thay đổi, vui lòng chọn lại ưu đãi" }
              : { ...application, status: "REVALIDATING" as const };
          });
        return {
          items: invalid.reduce((items, application) => removeBundleEffects(items, application), state.items),
          bundleApplications: retained,
        };
      }),
      setBundleApplicationStatus: (voucherToken, status, message) => set((state) => ({
        bundleApplications: state.bundleApplications.map((application) => application.voucher_qr_token === voucherToken ? { ...application, status, message } : application),
      })),
      markBundleApplicationsVerifyFailed: (message) => set((state) => ({
        bundleApplications: state.bundleApplications.map((application) => ({
          ...application,
          status: "VERIFY_FAILED" as const,
          message,
        })),
      })),
      markBundleApplicationsUnavailable: (message, voucherTokens) => set((state) =>
        markBundleApplicationsUnavailableState(
          state.items,
          state.bundleApplications,
          message,
          voucherTokens,
        ),
      ),

      addItem: (newItem) => {
        const items = newItem.itemVoucherId
          ? releaseVoucherFromOtherCartLines(get().items, newItem.itemVoucherId, null)
          : get().items;
        const cartId = crypto.randomUUID();
        set({ items: [...items, { ...newItem, cartId }] });
        return cartId;
      },

      insertItemAfter: (targetCartId, newItem) => {
        const items = newItem.itemVoucherId
          ? releaseVoucherFromOtherCartLines(get().items, newItem.itemVoucherId, null)
          : get().items;
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
            if ((i.productVoucherId || i.itemVoucherId || (i.addonVouchers && i.addonVouchers.length > 0)) && quantity > 1) {
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
        bundleApplications: [],
      }),

      applyProductVoucher: (cartId, voucherId, coveredPriceVnd) => {
        const currentItems = get().items.map((i) => {
          if (i.productVoucherId === voucherId || i.itemVoucherId === voucherId) {
            const nextI = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined, itemVoucherId: undefined };
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
        const isItemVoucher = item.category === "extras";
        const nextItem = {
          ...item,
          productVoucherId: isItemVoucher ? undefined : voucherId,
          productVoucherDiscountVnd: isItemVoucher ? undefined : coveredPriceVnd,
          itemVoucherId: isItemVoucher ? voucherId : undefined,
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
            const nextItem = { ...i, productVoucherId: undefined, productVoucherDiscountVnd: undefined, itemVoucherId: undefined };
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
    {
      name: "bcbm-staff-cart",
      version: 4,
      migrate: migrateStaffCartState,
      partialize: (state) => ({
        ...state,
        items: state.items,
      }),
    }
  )
);

export const useStaffCartTotalItems = () =>
  useStaffCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

export const useStaffCartTotalPrice = () =>
  useStaffCartStore((s) => s.items.reduce((sum, i) => sum + i.clientPriceVnd * i.quantity, 0));
