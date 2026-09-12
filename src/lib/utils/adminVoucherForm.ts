import type { CreateVoucherPackageInput } from "@/src/services/adminVoucherService";
import { buildBundleVoucherInput, type BundleProductScopeDraft, type BundleVoucherFormState } from "@/src/lib/utils/adminVoucherBundle";
import { toExclusiveEndIso } from "@/src/lib/utils/voucherDates";
import { formatSizeLabel } from "@/src/utils/display";

export { formatInclusiveEndDate, toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export type VoucherType = "ITEM" | "DISCOUNT" | "PRODUCT" | "PRODUCT_DISCOUNT" | "ADDON" | "FREESHIP" | "BUNDLE";
export interface VoucherDraft extends BundleVoucherFormState {
  voucherType: VoucherType;
  visibility: "PUBLIC" | "PRIVATE";
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  productDiscountMode: "FIXED_AMOUNT" | "PAY_AS_SIZE";
  eligibleSizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
  referenceSize: "SMALL" | "MEDIUM" | "LARGE";
  menuItemId: string;
  productTargets: BundleProductScopeDraft[];
  eligibleMenuItemIds?: string[];
  size: "SMALL" | "MEDIUM" | "LARGE";
  matchaPowderId: string;
  milkTypeId: string;
  addonOptionId: string;
  eligibleAddonOptionIds: string[];
  coveredDeliveryFeeVnd: number;
  maxDiscountVnd: number | null;
}

/** Creates a predictable initial state for the admin voucher wizard. */
export function createEmptyVoucherDraft(): VoucherDraft {
  return {
    voucherType: "DISCOUNT", visibility: "PUBLIC", name: "", description: "", endsAt: "",
    acquisitionMode: "POINTS_EXCHANGE", pointsCost: 10, expiresAfterDays: 30,
    quantity: null, maxPerUser: 1, minOrderVnd: null,
    discountType: "PERCENT", discountValue: 10, productDiscountMode: "FIXED_AMOUNT", eligibleSizes: ["MEDIUM"], referenceSize: "SMALL", menuItemId: "", productTargets: [], eligibleMenuItemIds: [], size: "SMALL",
    matchaPowderId: "", milkTypeId: "", addonOptionId: "", eligibleAddonOptionIds: [], coveredDeliveryFeeVnd: 30_000, maxDiscountVnd: null,
    buyQuantity: 2, rewardQuantity: 1, rewardKind: "PRODUCT", rewardMode: "SAME_CONFIG",
    benefitScaling: "PER_BUNDLE", maxApplications: 1,
    qualifierScopes: [], rewardProductScopes: [], rewardAddonOptionIds: [],
  };
}

function common(draft: VoucherDraft) {
  return {
    name: draft.name.trim(), description: draft.description.trim() || undefined,
    visibility: draft.visibility,
    acquisition_mode: draft.visibility === "PRIVATE" ? "NONE" as const : draft.acquisitionMode,
    points_cost: draft.visibility === "PRIVATE" || draft.acquisitionMode !== "POINTS_EXCHANGE" ? 0 : draft.pointsCost,
    ends_at: toExclusiveEndIso(draft.endsAt),
    expires_after_days: draft.expiresAfterDays, quantity: draft.quantity,
    max_per_user: draft.maxPerUser,
  };
}

/** Builds the strict create payload for every voucher benefit type. */
export function buildVoucherInput(draft: VoucherDraft): CreateVoucherPackageInput {
  if (draft.voucherType === "BUNDLE") {
    const bundle = buildBundleVoucherInput(draft);
    return {
      ...bundle,
      visibility: draft.visibility,
      acquisition_mode: draft.visibility === "PRIVATE" ? "NONE" : bundle.acquisition_mode,
      points_cost: draft.visibility === "PRIVATE" ? 0 : bundle.points_cost,
    };
  }
  const base = common(draft);
  if (draft.voucherType === "ITEM") return { ...base, voucher_type: "ITEM", menu_item_id: draft.menuItemId, eligible_menu_item_ids: draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : [draft.menuItemId] };
  if (draft.voucherType === "PRODUCT") return {
    ...base, voucher_type: "PRODUCT", menu_item_id: draft.productTargets[0]?.menuItemId ?? draft.menuItemId,
    size: draft.productTargets[0]?.sizes[0] ?? draft.size,
    matcha_powder_id: (draft.productTargets[0]?.powderIds[0] ?? draft.matchaPowderId) || null,
    milk_type_id: (draft.productTargets[0]?.milkTypeIds[0] ?? draft.milkTypeId) || null,
    included_addon_option_ids: [],
    product_targets: (draft.productTargets.length ? draft.productTargets : [{
      menuItemId: draft.menuItemId, category: "fusion" as const, sizes: [draft.size],
      powderIds: draft.matchaPowderId ? [draft.matchaPowderId] : [],
      milkTypeIds: draft.milkTypeId ? [draft.milkTypeId] : [], fixedPowderId: null,
    }]).map((target) => ({
      menu_item_id: target.menuItemId,
      size: target.sizes[0],
      matcha_powder_id: target.category === "latte" ? null : target.powderIds[0] ?? null,
      milk_type_id: target.milkTypeIds[0] ?? null,
    })),
  };
  if (draft.voucherType === "PRODUCT_DISCOUNT") return {
    ...base, voucher_type: "PRODUCT_DISCOUNT", menu_item_id: draft.menuItemId,
    eligible_menu_item_ids: (draft.eligibleMenuItemIds?.length ?? 0) > 0 ? draft.eligibleMenuItemIds! : [draft.menuItemId],
    product_discount_mode: draft.productDiscountMode, eligible_sizes: draft.eligibleSizes,
    ...(draft.productDiscountMode === "FIXED_AMOUNT"
      ? { discount_value: draft.discountValue }
      : { reference_size: draft.referenceSize }),
  };
  if (draft.voucherType === "ADDON") return { ...base, voucher_type: "ADDON", addon_option_id: draft.addonOptionId, eligible_addon_option_ids: draft.eligibleAddonOptionIds.length ? draft.eligibleAddonOptionIds : [draft.addonOptionId] };
  if (draft.voucherType === "FREESHIP") return {
    ...base, voucher_type: "FREESHIP", covered_delivery_fee_vnd: draft.coveredDeliveryFeeVnd,
    min_order_vnd: draft.minOrderVnd,
  };
  return {
    ...base, voucher_type: "DISCOUNT", discount_type: draft.discountType,
    discount_value: draft.discountValue, min_order_vnd: draft.minOrderVnd,
    ...(draft.discountType === "PERCENT" && draft.maxDiscountVnd ? { max_discount_vnd: draft.maxDiscountVnd } : {}),
  };
}

/** Returns the first user-facing validation error for the voucher wizard. */
export function validateVoucherDraft(draft: VoucherDraft): string | null {
  if (!draft.name.trim()) return "Vui lòng nhập tên voucher";
  if (draft.acquisitionMode === "POINTS_EXCHANGE" && draft.pointsCost < 1) return "Điểm đổi phải lớn hơn 0";
  if (draft.voucherType === "DISCOUNT" && draft.discountType === "PERCENT" && draft.maxDiscountVnd !== null && draft.maxDiscountVnd % 1_000 !== 0) return "Mức giảm tối đa phải chia hết cho 1.000đ";
  if (draft.voucherType === "PRODUCT" && draft.productTargets.length === 0) return "Vui lòng chọn sản phẩm";
  if (draft.voucherType === "PRODUCT" && draft.productTargets.length > 100) return "Chỉ được chọn tối đa 100 sản phẩm";
  if (draft.voucherType === "PRODUCT" && draft.productTargets.some((target) => target.sizes.length !== 1)) return "Mỗi sản phẩm cần đúng một size";
  if (draft.voucherType === "PRODUCT" && draft.productTargets.some((target) => target.category === "fusion" && target.powderIds.length !== 1)) return "Mỗi món Fusion cần đúng một loại bột";
  if (draft.voucherType === "PRODUCT" && draft.productTargets.some((target) => target.milkTypeIds.length !== 1)) return "Mỗi sản phẩm cần đúng một Base Liquid";
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

export interface VoucherCopyLabels {
  menuLabels: ReadonlyMap<string, string>;
  addonLabels: ReadonlyMap<string, string>;
  powderLabels: ReadonlyMap<string, string>;
  milkLabels: ReadonlyMap<string, string>;
  defaultPowderByMenuId: ReadonlyMap<string, string>;
  defaultMilkByMenuId: ReadonlyMap<string, string>;
}

export interface VoucherCopySuggestion {
  name: string;
  description: string;
}

function compactVnd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  return `${value / 1_000}k`;
}

function fullVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

const PRODUCT_DISCOUNT_SIZE_LABELS = {
  SMALL: "nhỏ",
  MEDIUM: "vừa",
  LARGE: "lớn",
} as const;

function limitedLabels(ids: string[], labels: ReadonlyMap<string, string>): string {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0 || uniqueIds.length > 2) return "";
  return uniqueIds.map((id) => labels.get(id)).filter((label): label is string => Boolean(label)).join(", ");
}

/** Suggest editable customer-facing voucher copy from the current admin selections. */
export function suggestVoucherCopy(draft: VoucherDraft, labels: VoucherCopyLabels): VoucherCopySuggestion {
  const minimumName = draft.minOrderVnd ? ` cho đơn từ ${compactVnd(draft.minOrderVnd)}` : "";
  const minimumDescription = draft.minOrderVnd ? ` cho đơn hàng từ ${fullVnd(draft.minOrderVnd)}` : " cho đơn hàng";
  if (draft.voucherType === "DISCOUNT") {
    const value = draft.discountType === "PERCENT" ? `${draft.discountValue}%` : compactVnd(draft.discountValue);
    const detail = draft.discountType === "PERCENT" ? value : fullVnd(draft.discountValue);
    const maxName = draft.discountType === "PERCENT" && draft.maxDiscountVnd ? ` tối đa ${compactVnd(draft.maxDiscountVnd)}` : "";
    const maxDesc = draft.discountType === "PERCENT" && draft.maxDiscountVnd ? `, tối đa ${fullVnd(draft.maxDiscountVnd)}` : "";
    return { name: `Giảm ${value}${maxName}${minimumName}`, description: `Giảm ${detail}${minimumDescription}${maxDesc}.` };
  }
  if (draft.voucherType === "FREESHIP") {
    return { name: `Freeship đến ${compactVnd(draft.coveredDeliveryFeeVnd)}${minimumName}`, description: `Hỗ trợ phí giao hàng tối đa ${fullVnd(draft.coveredDeliveryFeeVnd)}${minimumDescription}.` };
  }
  if (draft.voucherType === "PRODUCT") {
    if (draft.productTargets.length > 1) {
      const names = limitedLabels(draft.productTargets.map((target) => target.menuItemId), labels.menuLabels);
      return {
        name: `Free 1 trong ${draft.productTargets.length} ly`,
        description: `Tặng 1 trong ${draft.productTargets.length} ly đã chọn${names ? `: ${names}` : ""}.`,
      };
    }
    const target = draft.productTargets[0];
    const menuId = target?.menuItemId ?? draft.menuItemId;
    const menu = labels.menuLabels.get(menuId);
    if (!menu) return { name: "", description: "" };
    const powderId = target?.powderIds[0] || labels.defaultPowderByMenuId.get(menuId) || "";
    const milkId = target?.milkTypeIds[0] || labels.defaultMilkByMenuId.get(menuId) || "";
    const detail = [menu, `size ${formatSizeLabel(target?.sizes[0] ?? draft.size)}`, labels.powderLabels.get(powderId), labels.milkLabels.get(milkId)].filter(Boolean).join(" ");
    return { name: `Free 1 ly ${menu}`, description: `Tặng 1 ly ${detail}.` };
  }
  if (draft.voucherType === "ITEM" || draft.voucherType === "ADDON") {
    const ids = draft.voucherType === "ITEM"
      ? (draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : [draft.menuItemId])
      : (draft.eligibleAddonOptionIds.length ? draft.eligibleAddonOptionIds : [draft.addonOptionId]);
    const labelMap = draft.voucherType === "ITEM" ? labels.menuLabels : labels.addonLabels;
    if (ids.length > 1) {
      const kind = draft.voucherType === "ITEM" ? "món" : "topping";
      const names = limitedLabels(ids, labelMap);
      return {
        name: `Free 1 trong ${ids.length} ${kind}`,
        description: `Tặng 1 trong ${ids.length} ${kind} đã chọn${names ? `: ${names}` : ""}.`,
      };
    }
    const label = labelMap.get(ids[0] ?? "");
    return label ? { name: `Free 1 ${label}`, description: `Tặng 1 ${label}.` } : { name: "", description: "" };
  }
  if (draft.voucherType === "PRODUCT_DISCOUNT") {
    const ids = draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : [draft.menuItemId];
    const targets = limitedLabels(ids.filter(Boolean), labels.menuLabels);
    const targetName = targets ? ` cho ${targets}` : " theo món";
    const sizes = draft.eligibleSizes.map(formatSizeLabel).join(", ");
    if (draft.productDiscountMode === "PAY_AS_SIZE") {
      const targetSize = draft.eligibleSizes[0];
      const targetSizeLabel = targetSize ? PRODUCT_DISCOUNT_SIZE_LABELS[targetSize] : "";
      const targetFishLabel = targetSize ? formatSizeLabel(targetSize).toLocaleLowerCase("vi-VN") : "";
      const targetLabels = names(ids.filter(Boolean), labels.menuLabels);
      return {
        name: targetFishLabel ? `Free upsize lên ${targetFishLabel}` : "Free upsize",
        description: `Free up size cho ${targetLabels || "các món đã chọn"}${targetSizeLabel ? ` lên size ${targetSizeLabel}` : ""}.`,
      };
    }
    const name = `Giảm ${compactVnd(draft.discountValue)}${targetName}`;
    return { name, description: `Giảm ${fullVnd(draft.discountValue)} cho ${targets || "các món đã chọn"}${sizes ? ` ở size ${sizes}` : ""}.` };
  }
  const qualifiers = limitedLabels(draft.qualifierScopes.map((scope) => scope.menuItemId), labels.menuLabels);
  const rewardIds = draft.rewardKind === "PRODUCT"
    ? draft.rewardProductScopes.map((scope) => scope.menuItemId)
    : draft.rewardAddonOptionIds;
  const rewards = draft.rewardKind === "PRODUCT" && draft.rewardMode === "SAME_CONFIG"
    ? "sản phẩm cùng loại"
    : limitedLabels(rewardIds, draft.rewardKind === "PRODUCT" ? labels.menuLabels : labels.addonLabels);
  const name = `Mua ${draft.buyQuantity}${qualifiers ? ` ${qualifiers}` : ""} tặng ${draft.rewardQuantity}${rewards ? ` ${rewards}` : ""}`;
  return { name, description: `${name}.` };
}

/** Describe the selected PRODUCT_DISCOUNT menu items and customer-facing target sizes. */
export function describeProductDiscountTargets(
  draft: VoucherDraft,
  menuLabels: ReadonlyMap<string, string>,
): string {
  if (draft.voucherType !== "PRODUCT_DISCOUNT") return "";
  const ids = (draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : [draft.menuItemId]).filter(Boolean);
  const targetLabels = names(ids, menuLabels);
  const sizeLabels = draft.eligibleSizes.map((size) => PRODUCT_DISCOUNT_SIZE_LABELS[size]).join(", ");
  if (!targetLabels || !sizeLabels) return "";
  return `Món áp dụng: ${targetLabels} size ${sizeLabels}`;
}

function describeScope(
  scope: BundleVoucherFormState["qualifierScopes"][number],
  menuLabels: ReadonlyMap<string, string>,
  powderLabels: ReadonlyMap<string, string>,
  milkLabels: ReadonlyMap<string, string>,
): string {
  const details: string[] = [];
  if (scope.sizes.length > 0) details.push(scope.sizes.map(formatSizeLabel).join(" + "));
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
    if (draft.discountType === "FIXED") return draft.quantity * draft.discountValue;
    if (draft.discountType === "PERCENT" && draft.maxDiscountVnd) return draft.quantity * draft.maxDiscountVnd;
    return null;
  }
  if (draft.voucherType === "FREESHIP") return draft.quantity * draft.coveredDeliveryFeeVnd;
  if (draft.voucherType === "PRODUCT") {
    const ids = draft.productTargets.length ? draft.productTargets.map((target) => target.menuItemId) : [draft.menuItemId];
    return draft.quantity * maxPrice(ids, menuPrices);
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
    const targetIds = draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : [draft.menuItemId];
    return draft.quantity * maxPrice(targetIds, menuPrices);
  }
  if (draft.voucherType === "ADDON") {
    const targetIds = draft.eligibleAddonOptionIds?.length ? draft.eligibleAddonOptionIds : [draft.addonOptionId];
    return draft.quantity * maxPrice(targetIds, addonPrices);
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
