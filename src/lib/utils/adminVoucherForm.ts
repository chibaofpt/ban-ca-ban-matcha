import type { CreateVoucherPackageInput } from "@/src/services/adminVoucherService";
import { buildBundleVoucherInput, type BundleVoucherFormState } from "@/src/lib/utils/adminVoucherBundle";
import { toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export { formatInclusiveEndDate, toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export type VoucherType = "ITEM" | "DISCOUNT" | "PRODUCT" | "PRODUCT_DISCOUNT" | "ADDON" | "FREESHIP" | "BUNDLE";
export interface VoucherDraft extends BundleVoucherFormState {
  voucherType: VoucherType;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  productDiscountMode: "FIXED_AMOUNT" | "PAY_AS_SIZE";
  eligibleSizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
  referenceSize: "SMALL" | "MEDIUM" | "LARGE";
  menuItemId: string;
  eligibleMenuItemIds?: string[];
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
    discountType: "PERCENT", discountValue: 10, productDiscountMode: "FIXED_AMOUNT", eligibleSizes: ["MEDIUM"], referenceSize: "SMALL", menuItemId: "", eligibleMenuItemIds: [], size: "SMALL",
    matchaPowderId: "", milkTypeId: "", addonOptionId: "", coveredDeliveryFeeVnd: 30_000,
    buyQuantity: 2, rewardQuantity: 1, rewardKind: "PRODUCT", rewardMode: "SAME_CONFIG",
    benefitScaling: "PER_BUNDLE", maxApplications: 1,
    qualifierScopes: [], rewardProductScopes: [], rewardAddonOptionIds: [],
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
  if (draft.voucherType === "ITEM") return { ...base, voucher_type: "ITEM", menu_item_id: draft.menuItemId };
  if (draft.voucherType === "PRODUCT") return {
    ...base, voucher_type: "PRODUCT", menu_item_id: draft.menuItemId, size: draft.size,
    matcha_powder_id: draft.matchaPowderId || null, milk_type_id: draft.milkTypeId || null,
    included_addon_option_ids: [],
  };
  if (draft.voucherType === "PRODUCT_DISCOUNT") return {
    ...base, voucher_type: "PRODUCT_DISCOUNT", menu_item_id: draft.menuItemId,
    eligible_menu_item_ids: (draft.eligibleMenuItemIds?.length ?? 0) > 0 ? draft.eligibleMenuItemIds! : [draft.menuItemId],
    product_discount_mode: draft.productDiscountMode, eligible_sizes: draft.eligibleSizes,
    ...(draft.productDiscountMode === "FIXED_AMOUNT"
      ? { discount_value: draft.discountValue }
      : { reference_size: draft.referenceSize }),
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
  if (draft.voucherType === "PRODUCT_DISCOUNT" && (draft.eligibleMenuItemIds?.length ?? 0) === 0 && !draft.menuItemId) return "Vui lòng chọn ít nhất một sản phẩm";
  if (draft.voucherType === "PRODUCT_DISCOUNT" && (draft.eligibleMenuItemIds?.length ?? 0) > 100) return "Chỉ được chọn tối đa 100 sản phẩm";
  if (draft.voucherType === "PRODUCT_DISCOUNT" && draft.eligibleSizes.length === 0) return "Vui lòng chọn ít nhất một size";
  if (draft.voucherType === "PRODUCT_DISCOUNT" && draft.productDiscountMode === "FIXED_AMOUNT" && (draft.discountValue <= 0 || draft.discountValue % 1_000 !== 0)) return "Mức giảm phải chia hết cho 1.000đ";
  if (draft.voucherType === "PRODUCT_DISCOUNT" && draft.productDiscountMode === "PAY_AS_SIZE") {
    const rank = { SMALL: 0, MEDIUM: 1, LARGE: 2 } as const;
    if (draft.eligibleSizes.some((size) => rank[size] <= rank[draft.referenceSize])) return "Size tham chiếu phải nhỏ hơn mọi size áp dụng";
  }
  if (draft.voucherType === "ITEM" && !draft.menuItemId) return "Vui lòng chọn Add-on";
  if (draft.voucherType === "ADDON" && !draft.addonOptionId) return "Vui lòng chọn addon";
  if (draft.voucherType === "BUNDLE" && draft.qualifierScopes.length === 0) return "Vui lòng chọn món điều kiện";
  if (draft.voucherType === "BUNDLE" && draft.rewardKind === "PRODUCT" && draft.rewardMode !== "SAME_CONFIG" && draft.rewardProductScopes.length === 0) return "Vui lòng chọn món quà";
  if (draft.voucherType === "BUNDLE" && draft.rewardKind === "PRODUCT" && draft.rewardMode === "FIXED_CONFIG") {
    if (draft.rewardProductScopes.length !== 1) return "Quà cố định chỉ được chọn một món";
    if (draft.rewardProductScopes.some((scope) => scope.category !== "extras" && scope.sizes.length === 0)) return "Vui lòng chọn ít nhất một size cho từng món quà";
    if (draft.rewardProductScopes.some((scope) => scope.category === "fusion" && scope.powderIds.length === 0)) return "Vui lòng chọn ít nhất một loại bột cho từng món Fusion";
    if (draft.rewardProductScopes.some((scope) => scope.category === "latte" && !scope.fixedPowderId)) return "Món Latte chưa có bột cố định hợp lệ";
    if (draft.rewardProductScopes.some((scope) => scope.category !== "extras" && scope.milkTypeIds.length === 0)) return "Vui lòng chọn Base Liquid cho từng món quà cố định";
  }
  if (draft.voucherType === "BUNDLE") {
    const missingDefaults = [...draft.qualifierScopes, ...draft.rewardProductScopes].some((scope) =>
      scope.category !== "extras" &&
      ((!scope.fixedPowderId && scope.powderIds.length !== 1) || scope.milkTypeIds.length !== 1),
    );
    if (missingDefaults) return "Mỗi món BUNDLE cần đúng một bột và một Base Liquid mặc định";
  }
  if (draft.voucherType === "BUNDLE" && draft.rewardKind === "ADDON" && draft.rewardAddonOptionIds.length === 0) return "Vui lòng chọn addon quà";
  if (draft.voucherType === "BUNDLE") {
    const scopeCount = (scope: BundleVoucherFormState["qualifierScopes"][number]) =>
      Math.max(1, scope.sizes.length);
    if (draft.qualifierScopes.reduce((sum, scope) => sum + scopeCount(scope), 0) > 100) return "Phạm vi món điều kiện vượt quá 100 cấu hình";
    if (draft.rewardProductScopes.reduce((sum, scope) => sum + scopeCount(scope), 0) > 100) return "Phạm vi món quà vượt quá 100 cấu hình";
  }
  return null;
}

function names(ids: string[], labels: ReadonlyMap<string, string>): string {
  return ids.map((id) => labels.get(id) ?? "Món đã chọn").join(", ");
}

const SIZE_LABEL = { SMALL: "Nhỏ", MEDIUM: "Vừa", LARGE: "Lớn" } as const;

function describeScope(
  scope: BundleVoucherFormState["qualifierScopes"][number],
  menuLabels: ReadonlyMap<string, string>,
  powderLabels: ReadonlyMap<string, string>,
  milkLabels: ReadonlyMap<string, string>,
): string {
  const details: string[] = [];
  if (scope.sizes.length > 0) details.push(scope.sizes.map((size) => SIZE_LABEL[size]).join(" + "));
  if (scope.category === "fusion" && scope.powderIds.length > 0) {
    details.push(scope.powderIds.map((id) => powderLabels.get(id) ?? "Bột đã chọn").join(" + "));
  }
  if (scope.milkTypeIds.length > 0) {
    details.push(scope.milkTypeIds.map((id) => milkLabels.get(id) ?? "Base Liquid đã chọn").join(" + "));
  }
  const name = menuLabels.get(scope.menuItemId) ?? "Món đã chọn";
  return details.length > 0 ? `${name} (${details.join(" · ")})` : name;
}

/** Build the admin review sentence from the exact voucher rule being published. */
export function describeVoucherDraft(
  draft: VoucherDraft,
  menuLabels: ReadonlyMap<string, string>,
  addonLabels: ReadonlyMap<string, string>,
  powderLabels: ReadonlyMap<string, string> = new Map(),
  milkLabels: ReadonlyMap<string, string> = new Map(),
): string {
  if (draft.voucherType !== "BUNDLE") return draft.description.trim() || draft.name.trim();
  const qualifiers = draft.qualifierScopes
    .map((scope) => describeScope(scope, menuLabels, powderLabels, milkLabels))
    .join(", ");
  const reward = draft.rewardKind === "PRODUCT"
    ? draft.rewardMode === "SAME_CONFIG"
      ? "cùng loại và cấu hình"
      : draft.rewardProductScopes
          .map((scope) => describeScope(scope, menuLabels, powderLabels, milkLabels))
          .join(", ")
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
  if (draft.voucherType === "PRODUCT_DISCOUNT") {
    const targetIds = draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : [draft.menuItemId];
    const maximumDrinkPrice = maxPrice(targetIds, menuPrices);
    const unitLiability = draft.productDiscountMode === "FIXED_AMOUNT"
      ? Math.min(draft.discountValue, maximumDrinkPrice || draft.discountValue)
      : maximumDrinkPrice;
    return draft.quantity * unitLiability;
  }
  if (draft.voucherType === "ITEM") {
    return draft.quantity * (menuPrices.get(draft.menuItemId) ?? 0);
  }
  if (draft.voucherType === "ADDON") {
    return draft.quantity * (addonPrices.get(draft.addonOptionId) ?? 0);
  }
  const unitPrice = draft.rewardKind === "ADDON"
    ? maxPrice(draft.rewardAddonOptionIds, addonPrices)
    : maxPrice(
        draft.rewardMode === "SAME_CONFIG"
          ? draft.qualifierScopes.map((scope) => scope.menuItemId)
          : draft.rewardProductScopes.map((scope) => scope.menuItemId),
        menuPrices,
      );
  const rewardUnits = draft.rewardKind === "ADDON" && draft.benefitScaling === "ONCE_PER_ORDER"
    ? draft.rewardQuantity
    : draft.rewardKind === "ADDON" && draft.benefitScaling === "PER_QUALIFYING_ITEM"
      ? draft.rewardQuantity * draft.buyQuantity * draft.maxApplications
      : draft.rewardQuantity * draft.maxApplications;
  return draft.quantity * rewardUnits * unitPrice;
}
