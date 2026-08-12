import type { CreateVoucherPackageInput } from "@/src/services/adminVoucherService";
import { buildBundleVoucherInput, type BundleVoucherFormState } from "@/src/lib/utils/adminVoucherBundle";
import { toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export { formatInclusiveEndDate, toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export type VoucherType = "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE";
export interface VoucherDraft extends BundleVoucherFormState {
  voucherType: VoucherType;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  menuItemId: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  matchaPowderId: string;
  milkTypeId: string;
  addonOptionId: string;
  coveredDeliveryFeeVnd: number;
}

/** Creates a predictable initial state for the admin voucher wizard. */
export function createEmptyVoucherDraft(): VoucherDraft {
  return {
    voucherType: "DISCOUNT", name: "", description: "", endsAt: "",
    acquisitionMode: "POINTS_EXCHANGE", pointsCost: 10, expiresAfterDays: 30,
    quantity: null, maxPerUser: 1, minOrderVnd: null,
    discountType: "PERCENT", discountValue: 10, menuItemId: "", size: "SMALL",
    matchaPowderId: "", milkTypeId: "", addonOptionId: "", coveredDeliveryFeeVnd: 30_000,
    buyQuantity: 2, rewardQuantity: 1, rewardKind: "PRODUCT", rewardMode: "SAME_CONFIG",
    benefitScaling: "PER_BUNDLE", maxApplications: 1, qualifierMenuItemIds: [],
    rewardMenuItemIds: [], rewardSize: "SMALL", rewardPowderId: "", rewardMilkTypeId: "",
    rewardAddonOptionIds: [], referencePriceVnd: 50_000,
  };
}

function common(draft: VoucherDraft) {
  return {
    name: draft.name.trim(), description: draft.description.trim() || undefined,
    acquisition_mode: draft.acquisitionMode,
    points_cost: draft.acquisitionMode === "POINTS_EXCHANGE" ? draft.pointsCost : 0,
    ends_at: toExclusiveEndIso(draft.endsAt),
    expires_after_days: draft.expiresAfterDays, quantity: draft.quantity,
    max_per_user: draft.maxPerUser,
  };
}

/** Builds the strict create payload for every voucher benefit type. */
export function buildVoucherInput(draft: VoucherDraft): CreateVoucherPackageInput {
  if (draft.voucherType === "BUNDLE") return buildBundleVoucherInput(draft);
  const base = common(draft);
  if (draft.voucherType === "PRODUCT") return {
    ...base, voucher_type: "PRODUCT", menu_item_id: draft.menuItemId, size: draft.size,
    matcha_powder_id: draft.matchaPowderId || null, milk_type_id: draft.milkTypeId || null,
    included_addon_option_ids: [],
  };
  if (draft.voucherType === "ADDON") return { ...base, voucher_type: "ADDON", addon_option_id: draft.addonOptionId };
  if (draft.voucherType === "FREESHIP") return {
    ...base, voucher_type: "FREESHIP", covered_delivery_fee_vnd: draft.coveredDeliveryFeeVnd,
    min_order_vnd: draft.minOrderVnd,
  };
  return {
    ...base, voucher_type: "DISCOUNT", discount_type: draft.discountType,
    discount_value: draft.discountValue, min_order_vnd: draft.minOrderVnd,
  };
}

/** Returns the first user-facing validation error for the voucher wizard. */
export function validateVoucherDraft(draft: VoucherDraft): string | null {
  if (!draft.name.trim()) return "Vui lòng nhập tên voucher";
  if (draft.acquisitionMode === "POINTS_EXCHANGE" && draft.pointsCost < 1) return "Điểm đổi phải lớn hơn 0";
  if (draft.voucherType === "PRODUCT" && !draft.menuItemId) return "Vui lòng chọn sản phẩm";
  if (draft.voucherType === "ADDON" && !draft.addonOptionId) return "Vui lòng chọn addon";
  if (draft.voucherType === "BUNDLE" && draft.qualifierMenuItemIds.length === 0) return "Vui lòng chọn món điều kiện";
  if (draft.voucherType === "BUNDLE" && draft.rewardKind === "PRODUCT" && draft.rewardMode !== "SAME_CONFIG" && draft.rewardMenuItemIds.length === 0) return "Vui lòng chọn món quà";
  if (draft.voucherType === "BUNDLE" && draft.rewardKind === "ADDON" && draft.rewardAddonOptionIds.length === 0) return "Vui lòng chọn addon quà";
  return null;
}

function names(ids: string[], labels: ReadonlyMap<string, string>): string {
  return ids.map((id) => labels.get(id) ?? "Món đã chọn").join(", ");
}

/** Build the admin review sentence from the exact voucher rule being published. */
export function describeVoucherDraft(
  draft: VoucherDraft,
  menuLabels: ReadonlyMap<string, string>,
  addonLabels: ReadonlyMap<string, string>,
): string {
  if (draft.voucherType !== "BUNDLE") return draft.description.trim() || draft.name.trim();
  const qualifiers = names(draft.qualifierMenuItemIds, menuLabels);
  const reward = draft.rewardKind === "PRODUCT"
    ? draft.rewardMode === "SAME_CONFIG"
      ? "cùng loại và cấu hình"
      : names(draft.rewardMenuItemIds, menuLabels)
    : names(draft.rewardAddonOptionIds, addonLabels);
  return `Mua ${draft.buyQuantity} trong nhóm ${qualifiers}; tặng ${draft.rewardQuantity} ${reward}`;
}

function maxPrice(ids: string[], prices: ReadonlyMap<string, number>): number {
  return ids.reduce((maximum, id) => Math.max(maximum, prices.get(id) ?? 0), 0);
}

/** Estimate the maximum configured voucher liability; null means it is unbounded. */
export function estimateVoucherLiabilityVnd(
  draft: VoucherDraft,
  menuPrices: ReadonlyMap<string, number>,
  addonPrices: ReadonlyMap<string, number>,
): number | null {
  if (draft.quantity === null) return null;
  if (draft.voucherType === "DISCOUNT") {
    return draft.discountType === "FIXED" ? draft.quantity * draft.discountValue : null;
  }
  if (draft.voucherType === "FREESHIP") return draft.quantity * draft.coveredDeliveryFeeVnd;
  if (draft.voucherType === "PRODUCT") {
    return draft.quantity * (menuPrices.get(draft.menuItemId) ?? 0);
  }
  if (draft.voucherType === "ADDON") {
    return draft.quantity * (addonPrices.get(draft.addonOptionId) ?? 0);
  }
  const unitPrice = draft.rewardKind === "ADDON"
    ? maxPrice(draft.rewardAddonOptionIds, addonPrices)
    : draft.rewardMode === "ALLOWED_SCOPE"
      ? draft.referencePriceVnd
      : maxPrice(
          draft.rewardMode === "SAME_CONFIG"
            ? draft.qualifierMenuItemIds
            : draft.rewardMenuItemIds,
          menuPrices,
        );
  const rewardUnits = draft.rewardKind === "ADDON" && draft.benefitScaling === "ONCE_PER_ORDER"
    ? draft.rewardQuantity
    : draft.rewardKind === "ADDON" && draft.benefitScaling === "PER_QUALIFYING_ITEM"
      ? draft.rewardQuantity * draft.buyQuantity * draft.maxApplications
      : draft.rewardQuantity * draft.maxApplications;
  return draft.quantity * rewardUnits * unitPrice;
}
