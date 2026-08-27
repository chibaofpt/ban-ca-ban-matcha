import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import {
  type BundleCartItem,
  type BundlePromotionRule,
} from "@/src/utils/bundlePromotion";
import { evaluateBundleApplications } from "@/src/utils/bundlePromotionApplications";
import {
  calcOrderTotals,
  type CalcOrderResult,
} from "@/src/utils/orderCalculator";

function cartItemToBundleItem(item: CartItem): BundleCartItem {
  const addonQuantities = new Map(item.selectedOptionIds.map((id) => [id, 1]));
  item.quantityAddonOptions.forEach((addon) => addonQuantities.set(addon.option_id, addon.quantity));
  return {
    client_line_id: item.cartId,
    menu_item_id: item.menuItemId,
    size: item.size,
    selected_powder_id: item.selectedPowderId ?? null,
    selected_milk_type_id: item.selectedBaseLiquidId ?? item.selectedMilkTypeId ?? null,
    unit_price_vnd: Math.max(0, item.originalClientPriceVnd - item.addonsPrice),
    quantity: item.quantity,
    product_voucher_quantity: item.productVoucherId && item.productVoucherType !== "PRODUCT_DISCOUNT" ? 1 : 0,
    product_discount_voucher_quantity: item.productVoucherId && item.productVoucherType === "PRODUCT_DISCOUNT" && (item.productVoucherDiscountVnd ?? 0) > 0 ? 1 : 0,
    product_discount_vnd: item.productVoucherType === "PRODUCT_DISCOUNT" ? item.productVoucherDiscountVnd ?? 0 : 0,
    item_voucher_quantity: item.itemVoucherId ? 1 : 0,
    addons: [...addonQuantities.entries()].map(([addon_option_id, quantity]) => ({
      addon_option_id,
      quantity,
      unit_price_vnd: item.addonPrices[addon_option_id] ?? 0,
      gram_value: null,
      voucher_discounted_quantity: item.addonVouchers?.filter((voucher) => voucher.addonOptionId === addon_option_id).length ?? 0,
    })),
  };
}

/** Minimal wallet-voucher shape needed by the client BUNDLE and order calculators. */
export type VoucherProjectionSource = Pick<
  MyVoucher,
  | "qr_token"
  | "voucher_type"
  | "discount_type"
  | "discount_value"
  | "covered_price_vnd"
  | "covered_delivery_fee_vnd"
  | "min_order_vnd"
  | "status"
  | "package"
>;

function toRule(voucher: VoucherProjectionSource): BundlePromotionRule | null {
  const rule = voucher.package.bundleRule;
  if (!rule) return null;
  const mapProducts = (products: typeof rule.qualifier_products) => products.map((product) => ({
    menu_item_id: product.menu_item_id,
    allowed_sizes: product.allowed_sizes,
    default_powder_id: product.default_powder_id,
    default_base_liquid_id: product.default_base_liquid_id,
    baseline_prices_vnd: product.baseline_prices_vnd ?? {},
    ...(product.baseline_price_vnd === undefined ? {} : { baseline_price_vnd: product.baseline_price_vnd }),
  }));
  return {
    min_order_vnd: voucher.min_order_vnd,
    buy_quantity: rule.buy_quantity,
    reward_quantity: rule.reward_quantity,
    reward_kind: rule.reward_kind,
    reward_mode: rule.reward_mode,
    benefit_scaling: rule.benefit_scaling,
    max_applications_per_order: rule.max_applications_per_order,
    max_reward_units_per_order: rule.max_reward_units_per_order,
    qualifier_products: mapProducts(rule.qualifier_products),
    reward_products: mapProducts(rule.reward_products),
    reward_addon_option_ids: rule.reward_addon_option_ids,
  };
}

export interface BundleClientProjection {
  bundle_discount_vnd: number;
  line_discounts_vnd: Map<string, number>;
  error_by_token: Map<string, string>;
}

/** Re-evaluate all persisted BUNDLE applications against the current client cart. */
export function projectBundleApplications(
  items: CartItem[],
  applications: CartBundleApplication[],
  vouchers: VoucherProjectionSource[],
): BundleClientProjection {
  const error_by_token = new Map<string, string>();
  const bundleItems = items.map(cartItemToBundleItem);
  const evaluationInputs = applications.flatMap((application) => {
    const voucher = vouchers.find((item) => item.qr_token === application.voucher_qr_token);
    const rule = voucher?.status === "ACTIVE" ? toRule(voucher) : null;
    if (!rule) {
      error_by_token.set(application.voucher_qr_token, "Voucher BUNDLE không còn khả dụng");
      return [];
    }
    return [{ ...application, rule }];
  });
  if (evaluationInputs.length !== applications.length) return { bundle_discount_vnd: 0, line_discounts_vnd: new Map(), error_by_token };
  try {
    const result = evaluateBundleApplications({ items: bundleItems, applications: evaluationInputs });
    return { bundle_discount_vnd: result.total_discount_vnd, line_discounts_vnd: result.line_discounts_vnd, error_by_token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể kiểm tra ưu đãi BUNDLE";
    applications.forEach((application) => error_by_token.set(application.voucher_qr_token, message));
    return { bundle_discount_vnd: 0, line_discounts_vnd: new Map(), error_by_token };
  }
}

/** Calculate the exact provisional client total using the shared BUNDLE/order calculators. */
export function projectCartTotals(input: {
  items: CartItem[];
  applications: CartBundleApplication[];
  vouchers: VoucherProjectionSource[];
  selectedVoucherIds: string[];
  shipping_fee_vnd: number;
}): { bundles: BundleClientProjection; totals: CalcOrderResult } {
  const bundles = projectBundleApplications(input.items, input.applications, input.vouchers);
  const voucherByToken = new Map(input.vouchers.map((voucher) => [voucher.qr_token, voucher]));
  const totals = calcOrderTotals({
    items: input.items.map((item) => ({
      menu_item_id: item.menuItemId,
      category: item.category,
      unit_price_vnd: Math.max(0, item.originalClientPriceVnd - item.addonsPrice),
      addons_price_vnd: item.addonsPrice,
      quantity: item.quantity,
      line_total: item.originalClientPriceVnd * item.quantity,
      bundle_discount_vnd: bundles.line_discounts_vnd.get(item.cartId) ?? 0,
      product_voucher_id: item.productVoucherId ?? null,
      item_voucher_id: item.itemVoucherId ?? null,
      product_voucher_covered_vnd: item.productVoucherId ? voucherByToken.get(item.productVoucherId)?.covered_price_vnd ?? 0 : 0,
      item_voucher_covered_vnd: item.itemVoucherId ? voucherByToken.get(item.itemVoucherId)?.covered_price_vnd ?? 0 : 0,
      addon_vouchers: (item.addonVouchers ?? []).map((link) => ({
        voucher_id: link.voucherId,
        addon_option_id: link.addonOptionId,
        covered_price_vnd: voucherByToken.get(link.voucherId)?.covered_price_vnd ?? link.discountVnd,
        unit_price_vnd: item.addonPrices[link.addonOptionId] ?? link.discountVnd,
      })),
    })),
    discountVouchers: input.selectedVoucherIds.flatMap((token) => {
      const voucher = voucherByToken.get(token);
      return voucher?.voucher_type === "DISCOUNT" && voucher.discount_type && voucher.discount_value !== null ? [{
        id: voucher.qr_token,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value,
        min_order_vnd: voucher.min_order_vnd,
      }] : [];
    }),
    freeshipVoucher: input.selectedVoucherIds.flatMap((token) => {
      const voucher = voucherByToken.get(token);
      return voucher?.voucher_type === "FREESHIP" && voucher.covered_delivery_fee_vnd !== null ? [{
        id: voucher.qr_token,
        covered_delivery_fee_vnd: voucher.covered_delivery_fee_vnd,
        min_order_vnd: voucher.min_order_vnd,
      }] : [];
    })[0] ?? null,
    shipping_fee_vnd: input.shipping_fee_vnd,
  });
  return { bundles, totals };
}
