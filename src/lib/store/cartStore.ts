"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  BundleApplicationStatus,
  BundleCartDraftCommit,
  BundleCreatedRewardEffect,
  BundleRuntimeStatus,
  CartBundleApplication,
  CartItem,
} from "@/src/lib/types/cart";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { addBusinessBreadcrumb } from "@/src/lib/observability";
import { applyCartCommand, type CartMutationResult } from "@/src/lib/utils/cartTransitions";
import { createSafeCartStorage, migrateCustomerCartState } from "./cartStorage";

export { normalizeVoucherOwnerPhone } from "./cartStorage";

export interface PendingAddonVoucherIntent {
  voucherId: string;
  addonOptionId: string;
  priceVnd: number;
  addonGroupId: string;
  maxSelect: number;
  groupOptionIds?: string[];
  isExtraMatcha?: boolean;
}

interface FixedAddonConfiguration {
  addonOptionId: string;
  priceVnd: number;
  addonGroupId: string;
  maxSelect: number;
  replaceOptionId?: string;
}

interface BundleRuntimeEntry { status: BundleRuntimeStatus; message?: string }

export interface CartState {
  items: CartItem[];
  selectedOrderVoucherTokens: string[];
  /** Runtime compatibility alias; not persisted. */
  selectedVoucherIds: string[];
  voucherOwnerKey: string | null;
  bundleApplications: CartBundleApplication[];
  bundleRuntime: Record<string, BundleRuntimeEntry>;
  isCartOpen: boolean;
  pendingAddonVoucher: PendingAddonVoucherIntent | null;
  persistenceWarning: string | null;
  projectedTotalVnd: number;
  setCartOpen: (open: boolean) => void;
  setPendingAddonVoucher: (intent: PendingAddonVoucherIntent | null) => void;
  setProjectedTotalVnd: (total: number) => void;
  addItem: (line: Omit<CartItem, "cartId">, options?: { consumePendingAddon?: boolean }) => CartMutationResult<{ cartId: string }>;
  removeItem: (cartId: string) => CartMutationResult;
  updateItem: (cartId: string, updates: Partial<Omit<CartItem, "cartId">>) => CartMutationResult;
  updateQuantity: (cartId: string, quantity: number) => CartMutationResult;
  clearCart: () => CartMutationResult;
  applyProductVoucher: (cartId: string, voucherId: string, coveredPriceVnd?: number, voucherType?: "PRODUCT" | "PRODUCT_DISCOUNT" | "ITEM") => CartMutationResult;
  removeProductVoucher: (cartId: string) => CartMutationResult;
  applyAddonVoucher: (cartId: string, voucherId: string, addonOptionId: string, context?: { groupOptionIds: string[]; maxSelect: number; isExtraMatcha: boolean; replaceOptionId?: string }) => CartMutationResult;
  removeAddonVoucher: (cartId: string, voucherId: string) => CartMutationResult;
  removeVoucherEffects: (voucherToken: string) => CartMutationResult;
  setSelectedOrderVoucherTokens: (ids: string[] | ((previous: string[]) => string[])) => CartMutationResult;
  setSelectedVoucherIds: (ids: string[] | ((previous: string[]) => string[])) => CartMutationResult;
  commitBundleCartDraft: (draft: BundleCartDraftCommit) => CartMutationResult;
  commitBundleApplication: (application: CartBundleApplication) => CartMutationResult;
  removeBundleApplication: (voucherToken: string) => CartMutationResult;
  clearBundleApplications: () => CartMutationResult;
  reconcileBundleApplications: (ownerKey: string | null) => CartMutationResult;
  detachVoucherOwner: (nextOwnerKey: string | null) => CartMutationResult;
  setBundleApplicationStatus: (voucherToken: string, status: BundleApplicationStatus, message?: string) => void;
  markBundleApplicationsVerifyFailed: (message: string) => void;
  markBundleApplicationsUnavailable: (message: string, voucherTokens: string[]) => void;
}

const transitionState = (state: CartState) => ({
  items: state.items,
  selectedOrderVoucherTokens: state.selectedOrderVoucherTokens,
  bundleApplications: state.bundleApplications,
});

/** Add or replace a fixed addon without persisting catalog or price snapshots. */
export function configureFixedAddon(item: CartItem, configuration: FixedAddonConfiguration): CartItem {
  if (item.configuration.size === null) return item;
  const replaceId = configuration.replaceOptionId === configuration.addonOptionId ? undefined : configuration.replaceOptionId;
  return {
    ...item,
    configuration: {
      ...item.configuration,
      addonOptionIds: item.configuration.addonOptionIds
        .filter((id) => id !== replaceId && id !== configuration.addonOptionId)
        .concat(configuration.addonOptionId),
    },
    addonVouchers: item.addonVouchers.filter((voucher) =>
      voucher.addonOptionId !== replaceId && voucher.addonOptionId !== configuration.addonOptionId),
  };
}

/** Attach a pending addon voucher to a minimal line in one immutable snapshot. */
export function attachPendingAddonVoucher(
  item: Omit<CartItem, "cartId">,
  pending: PendingAddonVoucherIntent,
  replaceOptionId?: string,
): Omit<CartItem, "cartId"> {
  const configured = configureFixedAddon({ ...item, cartId: "pending" }, { ...pending, replaceOptionId });
  const { cartId, ...line } = configured;
  void cartId;
  return {
    ...line,
    quantity: 1,
    addonVouchers: [...line.addonVouchers.filter((voucher) => voucher.token !== pending.voucherId), {
      token: pending.voucherId,
      addonOptionId: pending.addonOptionId,
    }],
  };
}

/** Remove only reward lines/addons recorded by one BUNDLE application. */
export function removeBundleEffects(items: CartItem[], application: CartBundleApplication): CartItem[] {
  const result = applyCartCommand({ items, selectedOrderVoucherTokens: [], bundleApplications: [application] }, { type: "REMOVE_BUNDLE", voucherToken: application.voucher_qr_token });
  return result.result.ok ? result.state.items : items;
}

/** Retain only generated effects still present in reward allocations. */
export function retainBundleRewardEffects(
  previous: BundleCreatedRewardEffect[],
  allocations: BundleSelectionAllocation[],
  added?: BundleCreatedRewardEffect,
): BundleCreatedRewardEffect[] {
  const seen = new Set<string>();
  return [...previous, ...(added ? [added] : [])].filter((effect) => {
    const retained = allocations.some((allocation) => allocation.client_line_id === effect.client_line_id &&
      (effect.kind === "LINE" ? allocation.addon_option_id === undefined : allocation.addon_option_id === effect.addon_option_id));
    const key = effect.kind === "LINE" ? `LINE:${effect.client_line_id}` : `ADDON:${effect.client_line_id}:${effect.addon_option_id}`;
    if (!retained || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Public migration seam retained for existing cart tests. */
export const migrateCartState = migrateCustomerCartState;

function mutation(set: (partial: Partial<CartState>) => void, get: () => CartState, command: Parameters<typeof applyCartCommand>[1]): CartMutationResult<unknown> {
  const transition = applyCartCommand(transitionState(get()), command);
  if (transition.result.ok) set(transition.state);
  const warning = get().persistenceWarning;
  return transition.result.ok && warning
    ? { ...transition.result, warning: { code: "PERSISTENCE_WRITE_FAILED", message: warning } }
    : transition.result;
}

function persistedSuccess(get: () => CartState): CartMutationResult {
  const warning = get().persistenceWarning;
  return warning
    ? { ok: true, value: undefined, warning: { code: "PERSISTENCE_WRITE_FAILED", message: warning } }
    : { ok: true, value: undefined };
}

/** Customer cart store; only the minimal v10 subset is persisted. */
export const useCartStore = create<CartState>()(persist((set, get) => ({
  items: [], selectedOrderVoucherTokens: [], selectedVoucherIds: [], voucherOwnerKey: null, bundleApplications: [], bundleRuntime: {},
  isCartOpen: false, pendingAddonVoucher: null, persistenceWarning: null, projectedTotalVnd: 0,
  setCartOpen: (isCartOpen) => set({ isCartOpen }),
  setPendingAddonVoucher: (pendingAddonVoucher) => set({ pendingAddonVoucher }),
  setProjectedTotalVnd: (projectedTotalVnd) => set({ projectedTotalVnd }),
  addItem: (line, options) => {
    const pending = options?.consumePendingAddon === false ? null : get().pendingAddonVoucher;
    const result = mutation(set, get, pending && line.configuration.size !== null ? {
      type: "ADD_LINE_WITH_ADDON",
      line,
      voucherToken: pending.voucherId,
      addonOptionId: pending.addonOptionId,
      groupOptionIds: pending.groupOptionIds ?? [pending.addonOptionId],
      maxSelect: pending.maxSelect,
      isExtraMatcha: pending.isExtraMatcha ?? false,
    } : { type: "ADD_LINE", line });
    if (result.ok) {
      if (pending && line.configuration.size !== null) set({ pendingAddonVoucher: null });
      addBusinessBreadcrumb("cart.add", { quantity: line.quantity });
    }
    return result as CartMutationResult<{ cartId: string }>;
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
  clearCart: () => { const result = mutation(set, get, { type: "CLEAR_CART" }); set({ pendingAddonVoucher: null, projectedTotalVnd: 0, selectedVoucherIds: [] }); return result as CartMutationResult; },
  applyProductVoucher: (cartId, voucherId, _covered, voucherType = "PRODUCT") => mutation(set, get, {
    type: "APPLY_LINE_VOUCHER", cartId,
    voucher: { token: voucherId, kind: voucherType },
  }) as CartMutationResult,
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
      selectedVoucherIds: get().selectedOrderVoucherTokens,
      pendingAddonVoucher: get().pendingAddonVoucher?.voucherId === voucherToken ? null : get().pendingAddonVoucher,
    });
    return result as CartMutationResult;
  },
  setSelectedOrderVoucherTokens: (ids) => {
    const tokens = typeof ids === "function" ? ids(get().selectedOrderVoucherTokens) : ids;
    const result = mutation(set, get, { type: "SET_ORDER_VOUCHERS", tokens });
    if (result.ok) set({ selectedVoucherIds: [...new Set(tokens)] });
    return result as CartMutationResult;
  },
  setSelectedVoucherIds: (ids) => get().setSelectedOrderVoucherTokens(ids),
  commitBundleCartDraft: (draft) => { const result = mutation(set, get, { type: "COMMIT_BUNDLE", draft }); if (result.ok) set((state) => ({ bundleRuntime: { ...state.bundleRuntime, [draft.application.voucher_qr_token]: { status: "READY" } } })); return result as CartMutationResult; },
  commitBundleApplication: (application) => mutation(set, get, { type: "COMMIT_BUNDLE", draft: { items: get().items, application } }) as CartMutationResult,
  removeBundleApplication: (voucherToken) => mutation(set, get, { type: "REMOVE_BUNDLE", voucherToken }) as CartMutationResult,
  clearBundleApplications: () => { let items = get().items; for (const application of get().bundleApplications) items = removeBundleEffects(items, application); set({ items, bundleApplications: [], bundleRuntime: {} }); return persistedSuccess(get); },
  reconcileBundleApplications: (ownerKey) => get().voucherOwnerKey !== ownerKey
    ? get().detachVoucherOwner(ownerKey)
    : mutation(set, get, { type: "RECONCILE_BUNDLE_OWNER", ownerKey: ownerKey ? `customer:${ownerKey}` : null }) as CartMutationResult,
  detachVoucherOwner: (voucherOwnerKey) => { const result = mutation(set, get, { type: "DETACH_VOUCHER_OWNER" }); set({ voucherOwnerKey, pendingAddonVoucher: null, bundleRuntime: {}, selectedVoucherIds: [] }); return result as CartMutationResult; },
  setBundleApplicationStatus: (token, status, message) => set((state) => ({ bundleRuntime: { ...state.bundleRuntime, [token]: { status, ...(message ? { message } : {}) } } })),
  markBundleApplicationsVerifyFailed: (message) => set((state) => ({ bundleRuntime: Object.fromEntries(state.bundleApplications.map((app) => [app.voucher_qr_token, { status: "VERIFY_FAILED", message }])) })),
  markBundleApplicationsUnavailable: (message, tokens) => set((state) => ({ bundleRuntime: { ...state.bundleRuntime, ...Object.fromEntries(tokens.map((token) => [token, { status: "UNAVAILABLE", message }])) } })),
}), {
  name: "bcbm-cart", version: 10, migrate: migrateCustomerCartState,
  storage: createJSONStorage(() => createSafeCartStorage((persistenceWarning) => useCartStore.setState({ persistenceWarning }))),
  merge: (persisted, current) => {
    const migrated = migrateCustomerCartState(persisted);
    return {
      ...current,
      ...migrated,
      selectedVoucherIds: migrated.selectedOrderVoucherTokens,
      bundleRuntime: Object.fromEntries(migrated.bundleApplications.map((application) => [
        application.voucher_qr_token,
        { status: "REVALIDATING" as const },
      ])),
    };
  },
  partialize: (state) => ({ items: state.items, selectedOrderVoucherTokens: state.selectedOrderVoucherTokens, voucherOwnerKey: state.voucherOwnerKey, bundleApplications: state.bundleApplications }),
}));

export const useCartTotalItems = () => useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
export const useCartTotalPrice = () => useCartStore((state) => state.projectedTotalVnd);
