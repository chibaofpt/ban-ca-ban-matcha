import type { CartItem, CartProjectionResult, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuData, MenuItem, Size } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { calcBaseLiquidDelta, calcFusionPrice, calcLattePrice, ceilTo1000, resolveGram } from "@/src/utils/pricing";
import { projectCartTotals } from "@/src/lib/utils/bundleVoucherProjection";

export interface CartProjectionInput {
  items: CartItem[];
  menuData: MenuData | null | undefined;
  powderData: PowderApiResponse | null | undefined;
  vouchers: MyVoucher[] | null | undefined;
  selectedOrderVoucherTokens: string[];
  bundleApplications: import("@/src/lib/types/cart").CartBundleApplication[];
  shippingFeeVnd: number;
}

/** Resolve the wallet input for projection without treating an anonymous cart as unresolved. */
export function resolveCartProjectionVouchers(
  session: "anonymous" | "authenticated",
  walletVerified: boolean,
  vouchers: MyVoucher[] | null | undefined,
): MyVoucher[] | null {
  if (session === "anonymous") return [];
  return walletVerified ? vouchers ?? [] : null;
}

function allMenuItems(menu: MenuData): MenuItem[] {
  return [...menu.latte, ...menu.fusion, ...(menu.extras ?? [])];
}

function drinkPrice(
  item: MenuItem,
  size: Size,
  powderId: string | undefined,
  baseLiquidId: string | undefined,
  menu: MenuData,
  powders: PowderApiResponse,
): { value: number; powderPrice: number } | null {
  const sizeRow = item.sizes.find((row) => row.size === size);
  if (!sizeRow) return null;
  const activePowderId = item.category === "latte"
    ? item.powder?.id
    : powderId ?? item.resolved_default_powder_id ?? undefined;
  const powder = powders.data.find((candidate) => candidate.id === activePowderId);
  if (!powder) return null;
  const gram = resolveGram(size, item.custom_powder_grams, powder.size_config, powders.default_powder_gram);
  const liquids = menu.base_liquids ?? menu.milk_types;
  if (item.category === "latte") {
    const selected = liquids.find((candidate) => candidate.id === baseLiquidId)
      ?? liquids.find((candidate) => candidate.is_default);
    if (!selected) return null;
    return {
      value: calcLattePrice({
        base_price_vnd: sizeRow.base_price_vnd,
        gram,
        powder_price_per_gram: powder.price_per_gram,
        milk_ml: sizeRow.base_liquid_ml ?? sizeRow.milk_ml,
        milk_price_per_ml: selected.price_per_ml,
      }),
      powderPrice: powder.price_per_gram,
    };
  }
  const defaultPowder = powders.data.find((candidate) => candidate.id === item.resolved_default_powder_id);
  const selectedAnchor = menu.latte.find((candidate) => candidate.id === powder.reference_latte_item_id)
    ?.sizes.find((row) => row.size === size)?.base_price_vnd ?? 0;
  const defaultAnchor = menu.latte.find((candidate) => candidate.id === defaultPowder?.reference_latte_item_id)
    ?.sizes.find((row) => row.size === size)?.base_price_vnd ?? 0;
  const selectedLiquid = liquids.find((candidate) => candidate.id === baseLiquidId);
  const defaultLiquid = liquids.find((candidate) => candidate.id === item.default_base_liquid_id);
  return {
    value: calcFusionPrice({
      base_price_vnd: sizeRow.base_price_vnd,
      gram,
      powder_price_per_gram: powder.price_per_gram,
      premium_latte: powder.id === defaultPowder?.id ? 0 : selectedAnchor - defaultAnchor,
      base_liquid_delta_vnd: selectedLiquid && defaultLiquid
        ? calcBaseLiquidDelta(sizeRow.base_liquid_ml ?? sizeRow.milk_ml, selectedLiquid.price_per_ml, defaultLiquid.price_per_ml)
        : 0,
    }),
    powderPrice: powder.price_per_gram,
  };
}

function productDiscount(voucher: MyVoucher, item: MenuItem, line: ProjectedCartLine, menu: MenuData, powders: PowderApiResponse): number {
  if (voucher.product_discount_mode === "FIXED_AMOUNT") {
    return Math.min(line.drinkPriceVnd, Math.max(0, voucher.discount_value ?? 0));
  }
  if (line.configuration.size === null || !voucher.reference_size) return 0;
  const reference = drinkPrice(item, voucher.reference_size, line.configuration.powderId, line.configuration.baseLiquidId, menu, powders);
  return reference ? Math.max(0, line.drinkPriceVnd - reference.value) : 0;
}

function voucherCanApply(voucher: MyVoucher | undefined): voucher is MyVoucher {
  return Boolean(voucher && voucher.status === "ACTIVE" && voucher.availability.can_apply);
}

function lineVoucherMatches(voucher: MyVoucher, raw: CartItem): boolean {
  if (!raw.lineVoucher || voucher.voucher_type !== raw.lineVoucher.kind) return false;
  const eligibleMenuIds = voucher.eligible_menu_items?.map((target) => target.menu_item_id) ?? [];
  const matchesMenuTarget = eligibleMenuIds.length > 0
    ? eligibleMenuIds.includes(raw.menuItemId)
    : !voucher.menu_item_id || voucher.menu_item_id === raw.menuItemId;
  if (!matchesMenuTarget) return false;
  return raw.configuration.size === null
    || !voucher.eligible_sizes?.length
    || voucher.eligible_sizes.includes(raw.configuration.size);
}

function resolveLine(
  raw: import("@/src/lib/types/cart").CartItem,
  menu: MenuData,
  powders: PowderApiResponse,
  vouchers: MyVoucher[],
): ProjectedCartLine {
  const item = allMenuItems(menu).find((candidate) => candidate.id === raw.menuItemId);
  const errors: string[] = [];
  if (!item) errors.push("Món không còn phục vụ");
  let drinkPriceVnd = 0;
  let powderPrice = 0;
  if (item?.category === "extras") drinkPriceVnd = item.unit_price_vnd ?? 0;
  else if (item && raw.configuration.size !== null) {
    const price = drinkPrice(item, raw.configuration.size, raw.configuration.powderId, raw.configuration.baseLiquidId, menu, powders);
    if (price) { drinkPriceVnd = price.value; powderPrice = price.powderPrice; }
    else errors.push("Cấu hình món không còn hợp lệ");
  } else if (item) errors.push("Cấu hình món không hợp lệ");

  const resolvedAddons = raw.configuration.size === null ? [] : raw.configuration.addonOptionIds.flatMap((id) => {
    const group = menu.addon_groups.find((candidate) => candidate.options.some((option) => option.id === id));
    const option = group?.options.find((candidate) => candidate.id === id);
    if (!group || !option) { errors.push("Topping không còn phục vụ"); return []; }
    return [{ id, label: option.label, groupId: group.id, groupName: group.name, maxSelect: group.max_select,
      priceVnd: ceilTo1000(option.gram_value === null ? option.price_vnd : option.gram_value * powderPrice),
      isExtraMatcha: option.gram_value !== null || group.is_dynamic_gram }];
  });
  const addonsPriceVnd = resolvedAddons.reduce((sum, addon) => sum + addon.priceVnd, 0);
  const grossUnitPriceVnd = drinkPriceVnd + addonsPriceVnd;
  const base: ProjectedCartLine = {
    ...raw, name: item?.name ?? "Món không còn phục vụ", imageUrl: item?.image_url ?? null,
    category: item?.category ?? "extras", ...(item ? { menuItem: item } : {}), resolvedAddons,
    drinkPriceVnd, addonsPriceVnd, grossUnitPriceVnd, personalVoucherDiscountVnd: 0,
    bundleDiscountVnd: 0, payableUnitVnd: grossUnitPriceVnd, lineTotalVnd: grossUnitPriceVnd * raw.quantity,
    errors, revalidating: false,
  };
  let personal = 0;
  if (raw.lineVoucher) {
    const voucher = vouchers.find((candidate) => candidate.qr_token === raw.lineVoucher?.token);
    if (raw.quantity !== 1 || !voucherCanApply(voucher) || !lineVoucherMatches(voucher, raw)) errors.push("Voucher món không còn hợp lệ");
    else if (raw.lineVoucher.kind === "ITEM") personal += grossUnitPriceVnd;
    else if (raw.lineVoucher.kind === "PRODUCT") {
      const credit = voucher.eligible_menu_items?.find((target) => target.menu_item_id === raw.menuItemId)?.covered_price_vnd
        ?? voucher.covered_price_vnd ?? 0;
      personal += Math.min(drinkPriceVnd, credit);
    } else if (item) personal += productDiscount(voucher, item, base, menu, powders);
  }
  for (const link of raw.addonVouchers) {
    const voucher = vouchers.find((candidate) => candidate.qr_token === link.token);
    const addon = resolvedAddons.find((candidate) => candidate.id === link.addonOptionId);
    const eligibleAddonIds = voucher?.eligible_addon_options?.map((target) => target.addon_option_id) ?? [];
    const matchesTarget = eligibleAddonIds.length > 0
      ? eligibleAddonIds.includes(link.addonOptionId)
      : !voucher?.addon_option_id || voucher.addon_option_id === link.addonOptionId;
    if (raw.quantity !== 1 || !voucherCanApply(voucher) || voucher.voucher_type !== "ADDON" || !matchesTarget || !addon || addon.isExtraMatcha) {
      errors.push("Voucher topping không còn hợp lệ");
    }
    else personal += addon.priceVnd;
  }
  return { ...base, personalVoucherDiscountVnd: Math.min(grossUnitPriceVnd, personal), payableUnitVnd: Math.max(0, grossUnitPriceVnd - personal), lineTotalVnd: Math.max(0, grossUnitPriceVnd - personal) * raw.quantity };
}

/** Join minimal cart IDs to current catalog/wallet and calculate checkout totals. */
export function projectCart(input: CartProjectionInput): CartProjectionResult {
  const awaiting = !input.menuData || !input.powderData || !input.vouchers;
  if (awaiting) {
    const lines = input.items.map((item) => ({
      ...item, name: "Đang kiểm tra…", imageUrl: null, category: "extras" as const, resolvedAddons: [],
      drinkPriceVnd: 0, addonsPriceVnd: 0, grossUnitPriceVnd: 0, personalVoucherDiscountVnd: 0,
      bundleDiscountVnd: 0, payableUnitVnd: 0, lineTotalVnd: 0, errors: [], revalidating: true,
    }));
    return { lines, totals: { subtotal_vnd: 0, item_discount_vnd: 0, discountable_subtotal_vnd: 0, total_voucher_discount_vnd: 0, total_vnd: 0, shipping_fee_vnd: input.shippingFeeVnd, freeship_discount_vnd: 0, grand_total_vnd: input.shippingFeeVnd, order_surplus_vnd: 0 }, checkoutBlocked: true, revalidating: true, errors: [], bundleRuntimeStatus: Object.fromEntries(input.bundleApplications.map((app) => [app.voucher_qr_token, "REVALIDATING"])), bundleErrorsByToken: {}, appliedOrderVoucherTokens: [] };
  }
  const menuData = input.menuData!;
  const powderData = input.powderData!;
  const vouchers = input.vouchers!;
  const lines = input.items.map((item) => resolveLine(item, menuData, powderData, vouchers));
  const projected = projectCartTotals({ items: lines, applications: input.bundleApplications, vouchers, selectedVoucherIds: input.selectedOrderVoucherTokens, shipping_fee_vnd: input.shippingFeeVnd });
  const withBundles = lines.map((line) => {
    const bundleDiscountVnd = projected.bundles.line_discounts_vnd.get(line.cartId) ?? 0;
    const lineTotalVnd = Math.max(0, line.lineTotalVnd - bundleDiscountVnd);
    const payableUnitVnd = Math.ceil(lineTotalVnd / Math.max(1, line.quantity));
    return { ...line, bundleDiscountVnd, payableUnitVnd, lineTotalVnd };
  });
  const invalidOrderVoucherTokens = input.selectedOrderVoucherTokens.filter((token) => {
    const voucher = vouchers.find((candidate) => candidate.qr_token === token);
    return !voucherCanApply(voucher) || (voucher.voucher_type !== "DISCOUNT" && voucher.voucher_type !== "FREESHIP");
  });
  const errors = [
    ...withBundles.flatMap((line) => line.errors),
    ...projected.bundles.error_by_token.values(),
    ...invalidOrderVoucherTokens.map(() => "Voucher đơn hàng không còn hợp lệ"),
  ];
  return {
    lines: withBundles,
    totals: {
      subtotal_vnd: projected.totals.subtotal_vnd, item_discount_vnd: projected.totals.items_discount_vnd,
      discountable_subtotal_vnd: projected.totals.discountable_subtotal_vnd,
      total_voucher_discount_vnd: projected.totals.total_voucher_discount_vnd,
      total_vnd: projected.totals.total_vnd, shipping_fee_vnd: projected.totals.shipping_fee_vnd,
      freeship_discount_vnd: projected.totals.freeship_discount_vnd, grand_total_vnd: projected.totals.grand_total_vnd,
      order_surplus_vnd: projected.totals.order_surplus_vnd,
    },
    checkoutBlocked: errors.length > 0, revalidating: false, errors,
    bundleRuntimeStatus: Object.fromEntries(input.bundleApplications.map((app) => [app.voucher_qr_token, projected.bundles.error_by_token.has(app.voucher_qr_token) ? "CONFLICT" : "READY"])),
    bundleErrorsByToken: Object.fromEntries(projected.bundles.error_by_token),
    appliedOrderVoucherTokens: projected.totals.appliedVoucherIds,
  };
}
