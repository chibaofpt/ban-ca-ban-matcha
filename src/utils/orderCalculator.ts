/** Input item for the shared client/server order calculator. */
export interface CalcOrderItem {
  menu_item_id: string;
  category?: "latte" | "fusion" | "extras";
  unit_price_vnd: number;
  addons_price_vnd: number;
  quantity: number;
  line_total: number;
  bundle_discount_vnd?: number;
  product_voucher_id?: string | null;
  item_voucher_id?: string | null;
  product_voucher_covered_vnd?: number;
  item_voucher_covered_vnd?: number;
  addon_vouchers: Array<{ voucher_id: string; addon_option_id: string; covered_price_vnd: number; unit_price_vnd?: number; gram_value?: number | null }>;
}

export interface CalcDiscountVoucher { id: string; discount_type: "FIXED" | "PERCENT"; discount_value: number; min_order_vnd: number | null; }
export interface CalcFreeshipVoucher { id: string; covered_delivery_fee_vnd: number; min_order_vnd: number | null; }
export interface CalcOrderInput { items: CalcOrderItem[]; discountVouchers: CalcDiscountVoucher[]; freeshipVoucher: CalcFreeshipVoucher | null; shipping_fee_vnd: number; }
export interface CalcItemVoucherResult {
  bundle_discount_vnd?: number;
  product_voucher_id: string | null;
  item_voucher_id: string | null;
  product_voucher_discount_vnd: number;
  item_voucher_discount_vnd: number;
  addon_vouchers: Array<{ voucher_id: string; addon_option_id: string; discount_applied_vnd: number }>;
  total_discount_vnd: number;
}
export interface CalcOrderResult {
  subtotal_vnd: number; items_discount_vnd: number; discountable_subtotal_vnd: number; total_voucher_discount_vnd: number;
  total_vnd: number; shipping_fee_vnd: number; freeship_discount_vnd: number; grand_total_vnd: number; order_surplus_vnd: number;
  itemResults: CalcItemVoucherResult[]; appliedVoucherIds: string[]; skippedVoucherIds: string[];
}

function itemDiscounts(items: CalcOrderItem[], applied: string[], skipped: string[]): { discount: number; surplus: number; itemResults: CalcItemVoucherResult[] } {
  let discount = 0;
  let surplus = 0;
  const itemResults: CalcItemVoucherResult[] = [];
  for (const item of items) {
    const bundle = Math.min(item.line_total, Math.max(0, item.bundle_discount_vnd ?? 0));
    let productId: string | null = null;
    let itemId: string | null = null;
    let productDiscount = 0;
    let itemDiscount = 0;
    const addonResults: CalcItemVoucherResult["addon_vouchers"] = [];
    const voucherId = item.item_voucher_id ?? item.product_voucher_id;
    if (voucherId) {
      if (applied.includes(voucherId)) skipped.push(voucherId);
      else if (item.item_voucher_id) {
        itemDiscount = Math.min(item.unit_price_vnd, item.line_total);
        if (itemDiscount > 0) { applied.push(voucherId); itemId = voucherId; } else skipped.push(voucherId);
      } else {
        const credit = item.product_voucher_covered_vnd ?? 0;
        productDiscount = Math.min(credit, item.unit_price_vnd);
        const itemSurplus = Math.max(0, credit - item.unit_price_vnd);
        if (productDiscount > 0 || itemSurplus > 0) { applied.push(voucherId); productId = voucherId; surplus += itemSurplus; } else skipped.push(voucherId);
      }
    }
    const addonIds = new Set<string>();
    for (const voucher of item.addon_vouchers) {
      if ((voucher.gram_value ?? 0) > 0 || addonIds.has(voucher.addon_option_id)) { skipped.push(voucher.voucher_id); continue; }
      const amount = Math.min(voucher.covered_price_vnd, voucher.unit_price_vnd ?? voucher.covered_price_vnd);
      if (amount <= 0) { skipped.push(voucher.voucher_id); continue; }
      addonIds.add(voucher.addon_option_id);
      applied.push(voucher.voucher_id);
      addonResults.push({ voucher_id: voucher.voucher_id, addon_option_id: voucher.addon_option_id, discount_applied_vnd: amount });
    }
    const addonDiscount = addonResults.reduce((sum, voucher) => sum + voucher.discount_applied_vnd, 0);
    discount += bundle + productDiscount + itemDiscount + addonDiscount;
    itemResults.push({ ...(bundle > 0 ? { bundle_discount_vnd: bundle } : {}), product_voucher_id: productId, item_voucher_id: itemId, product_voucher_discount_vnd: productDiscount, item_voucher_discount_vnd: itemDiscount, addon_vouchers: addonResults, total_discount_vnd: bundle + productDiscount + itemDiscount + addonDiscount });
  }
  return { discount, surplus, itemResults };
}

function orderDiscounts(vouchers: CalcDiscountVoucher[], subtotal: number, applied: string[], skipped: string[]): number {
  if (subtotal <= 0) { skipped.push(...vouchers.map((voucher) => voucher.id)); return 0; }
  let remaining = subtotal;
  let total = 0;
  for (const voucher of vouchers.filter((voucher) => voucher.discount_type === "FIXED")) {
    const amount = voucher.min_order_vnd !== null && subtotal < voucher.min_order_vnd ? 0 : Math.min(voucher.discount_value, remaining);
    if (amount > 0) { total += amount; remaining -= amount; applied.push(voucher.id); } else skipped.push(voucher.id);
  }
  const [percent, ...duplicates] = vouchers.filter((voucher) => voucher.discount_type === "PERCENT");
  skipped.push(...duplicates.map((voucher) => voucher.id));
  if (percent) {
    const amount = percent.min_order_vnd !== null && subtotal < percent.min_order_vnd ? 0 : Math.floor((remaining * percent.discount_value) / 100 / 1000) * 1000;
    if (amount > 0) { total += amount; applied.push(percent.id); } else skipped.push(percent.id);
  }
  return total;
}

/** Calculate BUNDLE → item → ADDON → DISCOUNT → FREESHIP totals in exact VND. */
export function calcOrderTotals(input: CalcOrderInput): CalcOrderResult {
  const appliedVoucherIds: string[] = [];
  const skippedVoucherIds: string[] = [];
  const subtotal_vnd = input.items.reduce((sum, item) => sum + item.line_total, 0);
  const itemResult = itemDiscounts(input.items, appliedVoucherIds, skippedVoucherIds);
  const discountable_subtotal_vnd = Math.max(0, subtotal_vnd - itemResult.discount);
  const total_voucher_discount_vnd = orderDiscounts(input.discountVouchers, discountable_subtotal_vnd, appliedVoucherIds, skippedVoucherIds);
  const total_vnd = Math.max(0, discountable_subtotal_vnd - total_voucher_discount_vnd);
  const shipping_fee_vnd = input.shipping_fee_vnd;
  const freeship = input.freeshipVoucher;
  const freeship_discount_vnd = freeship && shipping_fee_vnd > 0 && freeship.covered_delivery_fee_vnd > 0 && (freeship.min_order_vnd === null || total_vnd >= freeship.min_order_vnd) ? Math.min(shipping_fee_vnd, freeship.covered_delivery_fee_vnd) : 0;
  if (freeship) (freeship_discount_vnd > 0 ? appliedVoucherIds : skippedVoucherIds).push(freeship.id);
  return { subtotal_vnd, items_discount_vnd: itemResult.discount, discountable_subtotal_vnd, total_voucher_discount_vnd, total_vnd, shipping_fee_vnd, freeship_discount_vnd, grand_total_vnd: Math.max(0, total_vnd + shipping_fee_vnd - freeship_discount_vnd), order_surplus_vnd: itemResult.surplus, itemResults: itemResult.itemResults, appliedVoucherIds, skippedVoucherIds };
}
