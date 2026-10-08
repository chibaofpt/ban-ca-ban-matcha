import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { MenuData, Size } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { computeProductDiscountBenefit, computeVoucherItemPrice, resolveVoucherBaseLiquidId } from "@/src/hooks/useAddVoucherToCart";
import { getEligibleProductDiscountItems } from "@/src/utils/customerVoucherSelection";
import { estimateMultiDiscountSavings, isVoucherUsable } from "@/src/utils/voucherMatchUtils";
import { getVoucherAvailabilityMessage } from "./voucherModalHelpers";
import { formatCartMoney } from "@/src/utils/display";

export interface CartVoucherContext {
  menuData: MenuData;
  powders: PowderApiResponse["data"];
  defaultPowderGram: PowderApiResponse["default_powder_gram"];
  selectedDiscountVouchers: MyVoucher[];
  subtotalPrice: number;
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
}

export interface VoucherMenuTarget {
  menuItemId: string;
  size?: Size;
}

/** Resolve sellable default configurations, counting menu items rather than sizes or cart lines. */
export function getVoucherMenuTargets(voucher: MyVoucher, context: CartVoucherContext): VoucherMenuTarget[] {
  const { menuData, powders, defaultPowderGram } = context;
  const items = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
  const targets = voucher.voucher_type === "PRODUCT_DISCOUNT"
    ? getEligibleProductDiscountItems(items, voucher.eligible_menu_items, voucher.menu_item_id, voucher.eligible_sizes)
    : items.flatMap((item) => {
        const scope = voucher.eligible_menu_items?.find((target) => target.menu_item_id === item.id && target.is_available);
        if (voucher.eligible_menu_items?.length ? !scope : item.id !== voucher.menu_item_id) return [];
        const size = scope?.size ?? voucher.size;
        return [{ item, allowedSizes: size ? [size] : [], milkTypeId: scope?.milk_type_id ?? undefined }];
      });
  return targets.flatMap(({ item, allowedSizes }) => {
    if (voucher.voucher_type === "ITEM") {
      return item.category === "extras" && (item.unit_price_vnd ?? 0) > 0 ? [{ menuItemId: item.id }] : [];
    }
    if (item.category === "extras") return [];
    const scope = voucher.eligible_menu_items?.find((target) => target.menu_item_id === item.id);
    const requestedPowder = scope?.matcha_powder_id ?? voucher.matcha_powder_id;
    const defaultPowder = item.category === "latte" ? item.powder?.id : item.resolved_default_powder_id;
    const powderId = item.category === "fusion" && requestedPowder &&
      (requestedPowder === defaultPowder || item.allowed_powder_ids.includes(requestedPowder))
      ? requestedPowder : defaultPowder ?? null;
    if (!powders.some((powder) => powder.id === powderId && powder.is_available)) return [];
    const liquidId = resolveVoucherBaseLiquidId(item, scope?.milk_type_id ?? voucher.milk_type_id,
      menuData.base_liquids ?? menuData.milk_types);
    const requiredLiquid = scope?.milk_type_id ?? voucher.milk_type_id;
    if (voucher.voucher_type === "PRODUCT_DISCOUNT" && requiredLiquid && requiredLiquid !== liquidId) return [];
    const price = (size: Size) => computeVoucherItemPrice(item, size, powderId, liquidId, [],
      powders, defaultPowderGram, menuData.latte_price_anchors, menuData.base_liquids ?? menuData.milk_types, menuData.addon_groups).drinkPrice;
    const orderedSizes = allowedSizes.includes("MEDIUM")
      ? ["MEDIUM" as const, ...allowedSizes.filter((size) => size !== "MEDIUM")] : allowedSizes;
    const size = orderedSizes.find((candidate) => {
      if (!item.sizes.some((row) => row.size === candidate && row.base_price_vnd !== null)) return false;
      if (voucher.voucher_type === "PRODUCT") return Math.min(price(candidate), scope?.covered_price_vnd ?? voucher.covered_price_vnd ?? 0) > 0;
      const reference = voucher.product_discount_mode === "PAY_AS_SIZE" && voucher.reference_size &&
        item.sizes.some((row) => row.size === voucher.reference_size && row.base_price_vnd !== null)
        ? price(voucher.reference_size) : null;
      return computeProductDiscountBenefit(voucher, price(candidate), reference) > 0;
    });
    return size ? [{ menuItemId: item.id, size }] : [];
  });
}

/** Collect tokens attached to cart units and committed BUNDLE applications. */
export function getUsedCartVoucherTokens(
  items: readonly Pick<CartItem, "lineVoucher" | "addonVouchers">[],
  applications: readonly CartBundleApplication[],
): Set<string> {
  return new Set([
    ...items.flatMap((item) => [
      ...(item.lineVoucher ? [item.lineVoucher.token] : []),
      ...item.addonVouchers.map((voucher) => voucher.token),
    ]),
    ...applications.map((application) => application.voucher_qr_token),
  ]);
}

/** Share actionable voucher eligibility between cart cards and voucher-loss feedback. */
export function getCartVoucherAvailability(voucher: MyVoucher, context: CartVoucherContext) {
  const unavailable = (reason: string) => ({ canUse: false, reason, targets: [] as VoucherMenuTarget[] });
  const usable = (targets: VoucherMenuTarget[] = []) => ({ canUse: true, reason: "", targets });
  if (!isVoucherUsable(voucher)) return unavailable(getVoucherAvailabilityMessage(voucher) ?? "Voucher hiện chưa thể áp dụng");
  const selected = context.selectedDiscountVouchers.filter((candidate) => isVoucherUsable(candidate));
  const savings = estimateMultiDiscountSavings(selected, context.subtotalPrice);
  const minimumReason = (amount: number) => (voucher.min_order_vnd ?? 0) > amount
    ? `Cần thêm ${formatCartMoney((voucher.min_order_vnd ?? 0) - amount)} để sử dụng voucher` : null;
  if (voucher.voucher_type === "DISCOUNT") {
    const reason = minimumReason(context.subtotalPrice);
    if (reason) return unavailable(reason);
    const retained = selected.filter((candidate) => candidate.qr_token !== voucher.qr_token &&
      !(voucher.discount_type === "PERCENT" && candidate.discount_type === "PERCENT"));
    return estimateMultiDiscountSavings([...retained, voucher], context.subtotalPrice) >
      estimateMultiDiscountSavings(retained, context.subtotalPrice)
      ? usable() : unavailable("Voucher không tạo thêm ưu đãi cho đơn này");
  }
  if (voucher.voucher_type === "FREESHIP") {
    if (context.orderType !== "DELIVERY" || (context.shippingFee ?? 0) <= 0) return unavailable("Chỉ áp dụng khi đơn giao hàng có phí ship");
    const reason = minimumReason(context.subtotalPrice - savings);
    if (reason) return unavailable(reason);
    return (voucher.covered_delivery_fee_vnd ?? 0) > 0 ? usable() : unavailable("Voucher không tạo thêm ưu đãi cho đơn này");
  }
  if (["ITEM", "PRODUCT", "PRODUCT_DISCOUNT"].includes(voucher.voucher_type)) {
    const targets = getVoucherMenuTargets(voucher, context);
    return targets.length ? usable(targets) : unavailable("Không có món hoặc cấu hình khả dụng");
  }
  const hasAddon = (ids: readonly string[]) => context.menuData.addon_groups.some((group) =>
    !group.is_dynamic_gram && group.options.some((option) => ids.includes(option.id) && option.gram_value === null && option.price_vnd > 0));
  if (voucher.voucher_type === "ADDON") {
    const ids = voucher.eligible_addon_options?.length
      ? voucher.eligible_addon_options.filter((option) => option.is_active && !option.is_dynamic_gram).map((option) => option.addon_option_id)
      : voucher.addon_option_id ? [voucher.addon_option_id] : [];
    const drinks = [...context.menuData.latte, ...context.menuData.fusion];
    return hasAddon(ids) && drinks.some((item) => item.sizes.some((size) => size.base_price_vnd !== null))
      ? usable() : unavailable("Không có topping hoặc món phù hợp");
  }
  const rule = voucher.package.bundleRule;
  if (!rule) return unavailable("Voucher BUNDLE không còn khả dụng");
  const menuItems = [...context.menuData.latte, ...context.menuData.fusion, ...(context.menuData.extras ?? [])];
  const hasScope = (scopes: typeof rule.qualifier_products) => scopes.some((scope) =>
    scope.menu_item.is_available && menuItems.some((item) => item.id === scope.menu_item_id &&
      (item.category === "extras" ? (item.unit_price_vnd ?? 0) > 0
        : item.sizes.some((size) => scope.allowed_sizes.includes(size.size) && size.base_price_vnd !== null))));
  const hasReward = rule.reward_kind === "ADDON" ? hasAddon(rule.reward_addon_option_ids)
    : hasScope(rule.reward_mode === "SAME_CONFIG" ? rule.qualifier_products : rule.reward_products);
  return hasScope(rule.qualifier_products) && hasReward ? usable() : unavailable("Không có món mua hoặc quà khả dụng");
}
