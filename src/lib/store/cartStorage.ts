import type { StateStorage } from "zustand/middleware";
import type {
  CartAddonVoucher,
  CartBundleApplication,
  BundleCreatedRewardEffect,
  CartItem,
  CartLineConfiguration,
  CartLineVoucher,
} from "@/src/lib/types/cart";
import type { SweetnessLevel } from "@/src/lib/types/menu";

type UnknownRecord = Record<string, unknown>;

export interface PersistedCustomerCart {
  items: CartItem[];
  selectedOrderVoucherTokens: string[];
  voucherOwnerKey: string | null;
  bundleApplications: CartBundleApplication[];
}

export interface PersistedStaffCart {
  items: CartItem[];
  selectedOrderVoucherTokens: string[];
  customerQrToken: string | null;
  bundleApplications: CartBundleApplication[];
}

const record = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
const string = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
  : [];

function configuration(value: UnknownRecord): CartLineConfiguration | null {
  const existing = record(value.configuration);
  const source = existing ?? value;
  const size = source.size;
  const note = typeof source.note === "string" ? source.note : "";
  if (size === null || (!existing && value.category === "extras")) return { size: null, note };
  if (size !== "SMALL" && size !== "MEDIUM" && size !== "LARGE") return null;
  const sweetness = source.sweetness;
  const iceOption = source.iceOption;
  const validSweetness = ["NONE", "QUARTER", "HALF", "THREE_QUARTER", "FULL", "EXTRA"].includes(String(sweetness));
  const validIce = ["NORMAL", "LESS_ICE", "NO_ICE", "SEPARATE_ICE"].includes(String(iceOption));
  return {
    size,
    sweetness: validSweetness ? sweetness as SweetnessLevel : "FULL",
    iceOption: validIce ? iceOption as "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE" : "NORMAL",
    coldwhisk: source.coldwhisk === true,
    note,
    ...(string(source.powderId ?? source.selectedPowderId) ? { powderId: string(source.powderId ?? source.selectedPowderId) } : {}),
    ...(string(source.baseLiquidId ?? source.selectedBaseLiquidId ?? source.selectedMilkTypeId)
      ? { baseLiquidId: string(source.baseLiquidId ?? source.selectedBaseLiquidId ?? source.selectedMilkTypeId) }
      : {}),
    addonOptionIds: strings(source.addonOptionIds ?? source.selectedOptionIds),
  };
}

function lineVoucher(value: UnknownRecord): CartLineVoucher | undefined {
  const current = record(value.lineVoucher);
  const token = string(current?.token ?? value.itemVoucherId ?? value.productVoucherId);
  if (!token) return undefined;
  const rawKind = current?.kind ?? (value.itemVoucherId ? "ITEM" : value.productVoucherType ?? "PRODUCT");
  const kind = rawKind === "ITEM" || rawKind === "PRODUCT_DISCOUNT" ? rawKind : "PRODUCT";
  return { token, kind };
}

function addonVouchers(value: UnknownRecord, selectedIds: readonly string[]): CartAddonVoucher[] {
  if (!Array.isArray(value.addonVouchers)) return [];
  return value.addonVouchers.flatMap((entry) => {
    const item = record(entry);
    const token = string(item?.token ?? item?.voucherId);
    const addonOptionId = string(item?.addonOptionId);
    return token && addonOptionId && selectedIds.includes(addonOptionId) ? [{ token, addonOptionId }] : [];
  });
}

function migrateItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const migrated = value.flatMap((entry): CartItem[] => {
    const item = record(entry);
    if (!item) return [];
    const cartId = string(item.cartId);
    const menuItemId = string(item.menuItemId);
    const config = configuration(item);
    const quantity = typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    if (!cartId || !menuItemId || !config) return [];
    const selectedIds = config.size === null ? [] : config.addonOptionIds;
    return [{
      cartId, menuItemId, quantity, configuration: config,
      ...(lineVoucher(item) ? { lineVoucher: lineVoucher(item) } : {}),
      addonVouchers: addonVouchers(item, selectedIds),
    }];
  });

  const lastOwner = new Map<string, string>();
  for (const item of migrated) {
    if (item.lineVoucher) lastOwner.set(item.lineVoucher.token, item.cartId);
    for (const voucher of item.addonVouchers) lastOwner.set(voucher.token, item.cartId);
  }
  const deduped: CartItem[] = migrated.map((item): CartItem => {
    const next: CartItem = {
      ...item,
      addonVouchers: item.addonVouchers.filter((voucher) => lastOwner.get(voucher.token) === item.cartId),
    };
    if (!next.lineVoucher || lastOwner.get(next.lineVoucher.token) === next.cartId) return next;
    const { lineVoucher: _lineVoucher, ...withoutVoucher } = next;
    return withoutVoucher;
  });
  const usedIds = new Set(deduped.map((item) => item.cartId));
  return deduped.flatMap((item) => {
    if (item.quantity === 1 || (!item.lineVoucher && item.addonVouchers.length === 0)) return [item];
    let voucherCartId = `${item.cartId}:voucher`;
    let suffix = 1;
    while (usedIds.has(voucherCartId)) voucherCartId = `${item.cartId}:voucher-${suffix++}`;
    usedIds.add(voucherCartId);
    const { lineVoucher: _lineVoucher, ...paid } = item;
    return [
      { ...paid, quantity: item.quantity - 1, addonVouchers: [] },
      { ...item, cartId: voucherCartId, quantity: 1 },
    ];
  });
}

function mergedTokens(...values: unknown[]): string[] {
  return strings(values.flatMap((value) => strings(value)));
}

function allocations(value: unknown): { client_line_id: string; quantity: number; addon_option_id?: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    const clientLineId = string(item?.client_line_id);
    const quantity = item?.quantity;
    if (!clientLineId || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return [];
    const addonOptionId = string(item?.addon_option_id);
    return [{ client_line_id: clientLineId, quantity, ...(addonOptionId ? { addon_option_id: addonOptionId } : {}) }];
  });
}

function bundleApplications(value: unknown): CartBundleApplication[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    if (!item) return [];
    const token = string(item.voucher_qr_token);
    const ownerKey = string(item.owner_key);
    if (!token || !ownerKey) return [];
    const effects: BundleCreatedRewardEffect[] = [];
    if (Array.isArray(item.created_reward_effects)) for (const effect of item.created_reward_effects) {
      const current = record(effect);
      const kind = current?.kind;
      const clientLineId = string(current?.client_line_id);
      if (!current || !clientLineId || (kind !== "LINE" && kind !== "ADDON")) continue;
      if (kind === "LINE") { effects.push({ kind: "LINE", client_line_id: clientLineId }); continue; }
      const addonOptionId = string(current.addon_option_id);
      const quantity = current.quantity;
      if (addonOptionId && typeof quantity === "number" && quantity > 0) effects.push({ kind: "ADDON", client_line_id: clientLineId, addon_option_id: addonOptionId, quantity });
    }
    return [{
      voucher_qr_token: token, owner_key: ownerKey,
      qualifier_allocations: allocations(item.qualifier_allocations),
      reward_allocations: allocations(item.reward_allocations),
      created_reward_effects: effects,
    }];
  });
}

function root(value: unknown): UnknownRecord | null {
  if (typeof value === "string") {
    try { return record(JSON.parse(value)); } catch { return null; }
  }
  return record(value);
}

/** Migrate any customer cart version into the minimal v10 persistence contract. */
export function migrateCustomerCartState(value: unknown, _fromVersion = 0): PersistedCustomerCart {
  const old = root(value);
  if (!old) return { items: [], selectedOrderVoucherTokens: [], voucherOwnerKey: null, bundleApplications: [] };
  return {
    items: migrateItems(old.items),
    selectedOrderVoucherTokens: mergedTokens(old.selectedOrderVoucherTokens, old.selectedVoucherIds),
    voucherOwnerKey: string(old.voucherOwnerKey) ?? null,
    bundleApplications: bundleApplications(old.bundleApplications),
  };
}

/** Migrate any staff cart version into the minimal v6 persistence contract. */
export function migrateStaffCartState(value: unknown, _fromVersion = 0): PersistedStaffCart {
  const old = root(value);
  if (!old) return { items: [], selectedOrderVoucherTokens: [], customerQrToken: null, bundleApplications: [] };
  const customer = record(old.customerInfo);
  const customerData = record(customer?.data);
  const discount = record(old.discountVoucher);
  return {
    items: migrateItems(old.items),
    selectedOrderVoucherTokens: mergedTokens(
      old.selectedOrderVoucherTokens,
      old.selectedDiscountIds,
      old.selectedVoucherIds,
      string(discount?.qr_token) ? [discount?.qr_token] : [],
    ),
    customerQrToken: string(old.customerQrToken ?? customerData?.qr_token) ?? null,
    bundleApplications: bundleApplications(old.bundleApplications),
  };
}

/** Wrap localStorage so malformed reads and quota writes never destroy runtime cart state. */
export function createSafeCartStorage(onWarning: (message: string | null) => void): StateStorage {
  let hasWarning = false;
  return {
    getItem: (name) => {
      try {
        const value = localStorage.getItem(name);
        if (value === null) return null;
        JSON.parse(value);
        return value;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
        if (hasWarning) { hasWarning = false; onWarning(null); }
      } catch {
        if (!hasWarning) {
          hasWarning = true;
          onWarning("Giỏ hàng chưa được lưu. Nếu tải lại trang, thay đổi mới có thể bị mất.");
        }
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
        if (hasWarning) { hasWarning = false; onWarning(null); }
      } catch {
        if (!hasWarning) { hasWarning = true; onWarning("Không thể cập nhật dữ liệu giỏ hàng đã lưu."); }
      }
    },
  };
}
