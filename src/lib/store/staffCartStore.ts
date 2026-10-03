"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CustomerInfo } from "@/src/components/staff/CustomerSelectModal";
import type {
  BundleApplicationStatus,
  BundleCartDraftCommit,
  BundleRuntimeStatus,
  CartBundleApplication,
  CartItem,
} from "@/src/lib/types/cart";
import { applyCartCommand, type CartMutationResult } from "@/src/lib/utils/cartTransitions";
import { removeBundleEffects, type PendingAddonVoucherIntent } from "./cartStore";
import { createSafeCartStorage, migrateStaffCartState as migratePersistedStaffCart } from "./cartStorage";

interface BundleRuntimeEntry { status: BundleRuntimeStatus; message?: string }

export interface DiscountVoucher {
  qr_token: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
}

export interface StaffCartState {
  items: CartItem[];
  selectedOrderVoucherTokens: string[];
  /** Runtime compatibility aliases; not persisted. */
  selectedDiscountIds: string[];
  discountVoucher: DiscountVoucher | null;
  customerQrToken: string | null;
  bundleApplications: CartBundleApplication[];
  customerInfo: CustomerInfo | null;
  pendingAddonVoucher: PendingAddonVoucherIntent | null;
  bundleRuntime: Record<string, BundleRuntimeEntry>;
  persistenceWarning: string | null;
  projectedTotalVnd: number;
  setProjectedTotalVnd: (total: number) => void;
  addItem: (line: Omit<CartItem, "cartId">, options?: { consumePendingAddon?: boolean }) => CartMutationResult<{ cartId: string }>;
  insertItemAfter: (targetCartId: string, line: Omit<CartItem, "cartId">) => CartMutationResult<{ cartId: string }>;
  removeItem: (cartId: string) => CartMutationResult;
  updateItem: (cartId: string, updates: Partial<Omit<CartItem, "cartId">>) => CartMutationResult;
  updateQuantity: (cartId: string, quantity: number) => CartMutationResult;
  clearCart: () => CartMutationResult;
  setCustomerInfo: (info: CustomerInfo | null) => CartMutationResult;
  setCustomerQrToken: (token: string | null) => CartMutationResult;
  detachCustomer: () => CartMutationResult;
  setSelectedOrderVoucherTokens: (ids: string[] | ((previous: string[]) => string[])) => CartMutationResult;
  setSelectedDiscountIds: (ids: string[]) => CartMutationResult;
  toggleDiscountId: (token: string) => CartMutationResult;
  setDiscountVoucher: (voucher: DiscountVoucher | null) => CartMutationResult;
  toggleOrderVoucherToken: (token: string) => CartMutationResult;
  setPendingAddonVoucher: (intent: PendingAddonVoucherIntent | null) => void;
  applyProductVoucher: (cartId: string, voucherId: string, coveredPriceVnd?: number, voucherType?: "PRODUCT" | "PRODUCT_DISCOUNT" | "ITEM") => CartMutationResult;
  removeProductVoucher: (cartId: string) => CartMutationResult;
  applyAddonVoucher: (cartId: string, voucherId: string, addonOptionId: string, context?: { groupOptionIds: string[]; maxSelect: number; isExtraMatcha: boolean; replaceOptionId?: string }) => CartMutationResult;
  removeAddonVoucher: (cartId: string, voucherId: string) => CartMutationResult;
  removeVoucherEffects: (voucherToken: string) => CartMutationResult;
  commitBundleCartDraft: (draft: BundleCartDraftCommit) => CartMutationResult;
  commitBundleApplication: (application: CartBundleApplication) => CartMutationResult;
  removeBundleApplication: (voucherToken: string) => CartMutationResult;
  clearBundleApplications: () => CartMutationResult;
  reconcileBundleApplications: (ownerKey: string | null) => CartMutationResult;
  setBundleApplicationStatus: (voucherToken: string, status: BundleApplicationStatus, message?: string) => void;
  markBundleApplicationsVerifyFailed: (message: string) => void;
  markBundleApplicationsUnavailable: (message: string, voucherTokens: string[]) => void;
}

const transitionState = (state: StaffCartState) => ({
  items: state.items,
  selectedOrderVoucherTokens: state.selectedOrderVoucherTokens,
  bundleApplications: state.bundleApplications,
});

/** Public staff v6 migration seam. */
export const migrateStaffCartState = migratePersistedStaffCart;

function mutation(set: (partial: Partial<StaffCartState>) => void, get: () => StaffCartState, command: Parameters<typeof applyCartCommand>[1]): CartMutationResult<unknown> {
  const transition = applyCartCommand(transitionState(get()), command);
  if (transition.result.ok) set(transition.state);
  const warning = get().persistenceWarning;
  return transition.result.ok && warning
    ? { ...transition.result, warning: { code: "PERSISTENCE_WRITE_FAILED", message: warning } }
    : transition.result;
}

function persistedSuccess(get: () => StaffCartState): CartMutationResult {
  const warning = get().persistenceWarning;
  return warning
    ? { ok: true, value: undefined, warning: { code: "PERSISTENCE_WRITE_FAILED", message: warning } }
    : { ok: true, value: undefined };
}

/** Staff/Admin share one cart engine; only QR identity and minimal lines persist. */
export const useStaffCartStore = create<StaffCartState>()(persist((set, get) => ({
  items: [], selectedOrderVoucherTokens: [], selectedDiscountIds: [], discountVoucher: null, customerQrToken: null, bundleApplications: [],
  customerInfo: null, pendingAddonVoucher: null, bundleRuntime: {}, persistenceWarning: null, projectedTotalVnd: 0,
  setProjectedTotalVnd: (projectedTotalVnd) => set({ projectedTotalVnd }),
  addItem: (line, options) => {
    const pending = options?.consumePendingAddon === false ? null : get().pendingAddonVoucher;
    const result = mutation(set, get, pending && line.configuration.size !== null ? {
      type: "ADD_LINE_WITH_ADDON",
      line,
      voucherToken: pending.voucherId,
      addonOptionId: pending.addonOptionId,
      groupOptionIds: pending.groupOptionIds,
      maxSelect: pending.maxSelect,
      isExtraMatcha: pending.isExtraMatcha,
    } : { type: "ADD_LINE", line });
    if (result.ok && pending && line.configuration.size !== null) set({ pendingAddonVoucher: null });
    return result as CartMutationResult<{ cartId: string }>;
  },
  insertItemAfter: (targetCartId, line) => {
    const result = get().addItem(line);
    if (!result.ok) return result;
    const addedId = result.value.cartId;
    const items = get().items;
    const added = items.find((item) => item.cartId === addedId);
    const remaining = items.filter((item) => item.cartId !== addedId);
    const index = remaining.findIndex((item) => item.cartId === targetCartId);
    if (added && index >= 0) remaining.splice(index + 1, 0, added);
    set({ items: remaining });
    return result;
  },
  removeItem: (cartId) => mutation(set, get, { type: "REMOVE_LINE", cartId }) as CartMutationResult,
  updateItem: (cartId, updates) => {
    const current = get().items.find((item) => item.cartId === cartId);
    if (!current) return { ok: false, code: "ITEM_NOT_FOUND", message: "Không tìm thấy món trong giỏ" };
    const { cartId: currentCartId, ...line } = current;
    void currentCartId;
    return mutation(set, get, { type: "UPDATE_LINE", cartId, line: { ...line, ...updates } }) as CartMutationResult;
  },
  updateQuantity: (cartId, quantity) => mutation(set, get, { type: "CHANGE_QUANTITY", cartId, quantity }) as CartMutationResult,
  clearCart: () => { const result = mutation(set, get, { type: "CLEAR_CART" }); set({ pendingAddonVoucher: null, selectedDiscountIds: [], discountVoucher: null }); return result as CartMutationResult; },
  setCustomerInfo: (customerInfo) => {
    const nextQr = customerInfo?.type === "existing" ? customerInfo.data.qr_token : null;
    if (nextQr !== get().customerQrToken) {
      const detached = mutation(set, get, { type: "DETACH_VOUCHER_OWNER" });
      if (!detached.ok) return detached as CartMutationResult;
    }
    set({ customerInfo, customerQrToken: nextQr, pendingAddonVoucher: null, bundleRuntime: {}, selectedDiscountIds: get().selectedOrderVoucherTokens, discountVoucher: null });
    return persistedSuccess(get);
  },
  setCustomerQrToken: (customerQrToken) => {
    if (customerQrToken !== get().customerQrToken) mutation(set, get, { type: "DETACH_VOUCHER_OWNER" });
    set({ customerQrToken, customerInfo: null, pendingAddonVoucher: null, bundleRuntime: {}, selectedDiscountIds: get().selectedOrderVoucherTokens, discountVoucher: null });
    return persistedSuccess(get);
  },
  detachCustomer: () => { const result = mutation(set, get, { type: "DETACH_VOUCHER_OWNER" }); set({ customerQrToken: null, customerInfo: null, pendingAddonVoucher: null, bundleRuntime: {}, selectedDiscountIds: [], discountVoucher: null }); return result as CartMutationResult; },
  setSelectedOrderVoucherTokens: (ids) => {
    const tokens = typeof ids === "function" ? ids(get().selectedOrderVoucherTokens) : ids;
    const result = mutation(set, get, { type: "SET_ORDER_VOUCHERS", tokens });
    if (result.ok) set({ selectedDiscountIds: [...new Set(tokens)] });
    return result as CartMutationResult;
  },
  setSelectedDiscountIds: (ids) => get().setSelectedOrderVoucherTokens(ids),
  toggleDiscountId: (token) => get().toggleOrderVoucherToken(token),
  setDiscountVoucher: (voucher) => {
    const tokens = voucher ? [...get().selectedOrderVoucherTokens.filter((token) => token !== get().discountVoucher?.qr_token), voucher.qr_token] : get().selectedOrderVoucherTokens.filter((token) => token !== get().discountVoucher?.qr_token);
    const result = get().setSelectedOrderVoucherTokens(tokens);
    if (result.ok) set({ discountVoucher: voucher });
    return result;
  },
  toggleOrderVoucherToken: (token) => get().setSelectedOrderVoucherTokens((previous) => previous.includes(token) ? previous.filter((item) => item !== token) : [...previous, token]),
  setPendingAddonVoucher: (pendingAddonVoucher) => set({ pendingAddonVoucher }),
  applyProductVoucher: (cartId, voucherId, _covered, voucherType = "PRODUCT") => mutation(set, get, { type: "APPLY_LINE_VOUCHER", cartId, voucher: { token: voucherId, kind: voucherType } }) as CartMutationResult,
  removeProductVoucher: (cartId) => mutation(set, get, { type: "REMOVE_LINE_VOUCHER", cartId }) as CartMutationResult,
  applyAddonVoucher: (cartId, voucherId, addonOptionId, context) => mutation(set, get, {
    type: "APPLY_ADDON_VOUCHER", cartId, voucherToken: voucherId, addonOptionId,
    groupOptionIds: context?.groupOptionIds ?? [addonOptionId], maxSelect: context?.maxSelect ?? 1,
    isExtraMatcha: context?.isExtraMatcha ?? false, replaceOptionId: context?.replaceOptionId,
  }) as CartMutationResult,
  removeAddonVoucher: (cartId, voucherId) => mutation(set, get, { type: "REMOVE_ADDON_VOUCHER", cartId, voucherToken: voucherId }) as CartMutationResult,
  removeVoucherEffects: (voucherToken) => {
    const result = mutation(set, get, { type: "REMOVE_VOUCHER_EFFECTS", voucherToken });
    if (result.ok) set({
      selectedDiscountIds: get().selectedOrderVoucherTokens,
      discountVoucher: get().discountVoucher?.qr_token === voucherToken ? null : get().discountVoucher,
      pendingAddonVoucher: get().pendingAddonVoucher?.voucherId === voucherToken ? null : get().pendingAddonVoucher,
    });
    return result as CartMutationResult;
  },
  commitBundleCartDraft: (draft) => { const result = mutation(set, get, { type: "COMMIT_BUNDLE", draft }); if (result.ok) set((state) => ({ bundleRuntime: { ...state.bundleRuntime, [draft.application.voucher_qr_token]: { status: "READY" } } })); return result as CartMutationResult; },
  commitBundleApplication: (application) => mutation(set, get, { type: "COMMIT_BUNDLE", draft: { items: get().items, application } }) as CartMutationResult,
  removeBundleApplication: (voucherToken) => mutation(set, get, { type: "REMOVE_BUNDLE", voucherToken }) as CartMutationResult,
  clearBundleApplications: () => { let items = get().items; for (const app of get().bundleApplications) items = removeBundleEffects(items, app); set({ items, bundleApplications: [], bundleRuntime: {} }); return persistedSuccess(get); },
  reconcileBundleApplications: (ownerKey) => mutation(set, get, { type: "RECONCILE_BUNDLE_OWNER", ownerKey }) as CartMutationResult,
  setBundleApplicationStatus: (token, status, message) => set((state) => ({ bundleRuntime: { ...state.bundleRuntime, [token]: { status, ...(message ? { message } : {}) } } })),
  markBundleApplicationsVerifyFailed: (message) => set((state) => ({ bundleRuntime: Object.fromEntries(state.bundleApplications.map((app) => [app.voucher_qr_token, { status: "VERIFY_FAILED", message }])) })),
  markBundleApplicationsUnavailable: (message, tokens) => set((state) => ({ bundleRuntime: { ...state.bundleRuntime, ...Object.fromEntries(tokens.map((token) => [token, { status: "UNAVAILABLE", message }])) } })),
}), {
  name: "bcbm-staff-cart", version: 6, migrate: migratePersistedStaffCart,
  storage: createJSONStorage(() => createSafeCartStorage((persistenceWarning) => useStaffCartStore.setState({ persistenceWarning }))),
  merge: (persisted, current) => {
    const migrated = migratePersistedStaffCart(persisted);
    return {
      ...current,
      ...migrated,
      selectedDiscountIds: migrated.selectedOrderVoucherTokens,
      bundleRuntime: Object.fromEntries(migrated.bundleApplications.map((application) => [
        application.voucher_qr_token,
        { status: "REVALIDATING" as const },
      ])),
    };
  },
  partialize: (state) => ({ items: state.items, selectedOrderVoucherTokens: state.selectedOrderVoucherTokens, customerQrToken: state.customerQrToken, bundleApplications: state.bundleApplications }),
}));

export const useStaffCartTotalPrice = () => useStaffCartStore((state) => state.projectedTotalVnd);
