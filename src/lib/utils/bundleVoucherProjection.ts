import type { CartBundleApplication, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { BundleCartItem, BundlePromotionRule } from "@/src/utils/bundlePromotion";
import { evaluateBundleApplications } from "@/src/utils/bundlePromotionApplications";
import { calcOrderTotals, type CalcOrderResult } from "@/src/utils/orderCalculator";

function cartItemToBundleItem(item: ProjectedCartLine): BundleCartItem {
  const config = item.configuration;
  return {
    client_line_id: item.cartId,
    menu_item_id: item.menuItemId,
    size: config.size,
    selected_powder_id: config.size === null ? null : config.powderId ?? null,
    selected_milk_type_id: config.size === null ? null : config.baseLiquidId ?? null,
    unit_price_vnd: item.drinkPriceVnd,
    quantity: item.quantity,
    product_voucher_quantity: item.lineVoucher?.kind === "PRODUCT" ? 1 : 0,
    product_discount_voucher_quantity: item.lineVoucher?.kind === "PRODUCT_DISCOUNT" ? 1 : 0,
    product_discount_vnd: item.lineVoucher?.kind === "PRODUCT_DISCOUNT" ? item.personalVoucherDiscountVnd : 0,
    item_voucher_quantity: item.lineVoucher?.kind === "ITEM" ? 1 : 0,
    personal_voucher_quantity: item.lineVoucher || item.addonVouchers.length > 0 ? 1 : 0,
    addons: item.resolvedAddons.map((addon) => ({
      addon_option_id: addon.id,
      addon_group_id: addon.groupId,
      max_select: item.menuItem ? undefined : 1,
      quantity: item.quantity,
      unit_price_vnd: addon.priceVnd,
      gram_value: addon.isExtraMatcha ? 1 : null,
      voucher_discounted_quantity: item.addonVouchers.some((voucher) => voucher.addonOptionId === addon.id) ? 1 : 0,
      personal_voucher_quantity: item.addonVouchers.some((voucher) => voucher.addonOptionId === addon.id) ? 1 : 0,
      is_active: true,
      is_deleted: false,
      is_dynamic_gram: addon.isExtraMatcha,
    })),
  };
}

export type VoucherProjectionSource = Pick<MyVoucher,
  "qr_token" | "voucher_type" | "discount_type" | "discount_value" | "max_discount_vnd" |
  "covered_price_vnd" | "covered_delivery_fee_vnd" | "min_order_vnd" | "status" | "package" | "eligible_menu_items"
>;

function toRule(voucher: VoucherProjectionSource): BundlePromotionRule | null {
  const rule = voucher.package.bundleRule;
  if (!rule) return null;
  const products = (entries: typeof rule.qualifier_products) => entries.map((product) => ({
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
    qualifier_products: products(rule.qualifier_products),
    reward_products: products(rule.reward_products),
    reward_addon_option_ids: rule.reward_addon_option_ids,
  };
}

export interface BundleClientProjection {
  bundle_discount_vnd: number;
  line_discounts_vnd: Map<string, number>;
  error_by_token: Map<string, string>;
}

/** Re-evaluate persisted BUNDLE allocations against current projected cart lines. */
export function projectBundleApplications(
  items: ProjectedCartLine[],
  applications: CartBundleApplication[],
  vouchers: VoucherProjectionSource[],
): BundleClientProjection {
  const errorByToken = new Map<string, string>();
  const inputs = applications.flatMap((application) => {
    const voucher = vouchers.find((item) => item.qr_token === application.voucher_qr_token);
    const rule = voucher?.status === "ACTIVE" ? toRule(voucher) : null;
    if (!rule) {
      errorByToken.set(application.voucher_qr_token, "Voucher BUNDLE không còn khả dụng");
      return [];
    }
    return [{ ...application, rule }];
  });
  if (inputs.length !== applications.length) return { bundle_discount_vnd: 0, line_discounts_vnd: new Map(), error_by_token: errorByToken };
  const bundleItems = items.map(cartItemToBundleItem);
  const validInputs = inputs.filter((input) => {
    try {
      evaluateBundleApplications({ items: bundleItems, applications: [input] });
      return true;
    } catch (error) {
      errorByToken.set(input.voucher_qr_token, error instanceof Error ? error.message : "Không thể kiểm tra ưu đãi BUNDLE");
      return false;
    }
  });
  try {
    const result = evaluateBundleApplications({ items: bundleItems, applications: validInputs });
    return { bundle_discount_vnd: result.total_discount_vnd, line_discounts_vnd: result.line_discounts_vnd, error_by_token: errorByToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể kiểm tra ưu đãi BUNDLE";
    for (const application of validInputs) errorByToken.set(application.voucher_qr_token, message);
    return { bundle_discount_vnd: 0, line_discounts_vnd: new Map(), error_by_token: errorByToken };
  }
}

/** Calculate the client preview with the same BUNDLE and order calculators as checkout. */
export function projectCartTotals(input: {
  items: ProjectedCartLine[];
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
      unit_price_vnd: item.drinkPriceVnd,
      addons_price_vnd: item.addonsPriceVnd,
      quantity: item.quantity,
      line_total: item.grossUnitPriceVnd * item.quantity,
      bundle_discount_vnd: bundles.line_discounts_vnd.get(item.cartId) ?? 0,
      product_voucher_id: item.lineVoucher?.kind === "PRODUCT" || item.lineVoucher?.kind === "PRODUCT_DISCOUNT" ? item.lineVoucher.token : null,
      item_voucher_id: item.lineVoucher?.kind === "ITEM" ? item.lineVoucher.token : null,
      product_voucher_covered_vnd: item.lineVoucher?.kind === "PRODUCT" ?
        voucherByToken.get(item.lineVoucher.token)?.eligible_menu_items?.find((target) => target.menu_item_id === item.menuItemId)?.covered_price_vnd
          ?? voucherByToken.get(item.lineVoucher.token)?.covered_price_vnd ?? 0 : 0,
      product_voucher_discount_vnd: item.lineVoucher?.kind === "PRODUCT_DISCOUNT" ? item.personalVoucherDiscountVnd : undefined,
      item_voucher_covered_vnd: item.lineVoucher?.kind === "ITEM" ? item.grossUnitPriceVnd : 0,
      addon_vouchers: item.addonVouchers.flatMap((link) => {
        const addon = item.resolvedAddons.find((candidate) => candidate.id === link.addonOptionId);
        return addon ? [{ voucher_id: link.token, addon_option_id: link.addonOptionId, covered_price_vnd: addon.priceVnd, unit_price_vnd: addon.priceVnd }] : [];
      }),
    })),
    discountVouchers: input.selectedVoucherIds.flatMap((token) => {
      const voucher = voucherByToken.get(token);
      return voucher?.voucher_type === "DISCOUNT" && voucher.discount_type && voucher.discount_value !== null
        ? [{ id: token, discount_type: voucher.discount_type, discount_value: voucher.discount_value, min_order_vnd: voucher.min_order_vnd, max_discount_vnd: voucher.max_discount_vnd ?? null }]
        : [];
    }),
    freeshipVoucher: input.selectedVoucherIds.flatMap((token) => {
      const voucher = voucherByToken.get(token);
      return voucher?.voucher_type === "FREESHIP" && voucher.covered_delivery_fee_vnd !== null
        ? [{ id: token, covered_delivery_fee_vnd: voucher.covered_delivery_fee_vnd, min_order_vnd: voucher.min_order_vnd }]
        : [];
    })[0] ?? null,
    shipping_fee_vnd: input.shipping_fee_vnd,
  });
  return { bundles, totals };
}
