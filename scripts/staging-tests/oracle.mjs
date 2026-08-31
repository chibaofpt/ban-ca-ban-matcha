import { invariant, prerequisite } from "./errors.mjs";

const ceilMoney = value => Math.ceil(value / 1_000) * 1_000;
const row = (rows, id) => rows.find(candidate => candidate.id === id);

/** Independently quote a selected catalog line; never import the application calculator. */
export function quoteLine(catalog, input) {
  const item = row(catalog.items, input.menu_item_id);
  invariant(item, "ORACLE_MENU_MISSING");
  if (item.category === "extras") {
    invariant(Number.isSafeInteger(item.unit_price_vnd), "ORACLE_EXTRAS_PRICE_MISSING");
    return { drink: item.unit_price_vnd, addons: 0, addonsDetail: [], powderId: null, liquidId: null, baseLiquidMl: null };
  }
  prerequisite(["latte", "fusion"].includes(item.category), "ORACLE_CATEGORY_UNSUPPORTED");
  const size = item.sizes.find(candidate => candidate.size === input.size);
  invariant(size?.base_price_vnd != null, "ORACLE_SIZE_MISSING");
  const defaultPowderId = item.default_powder_id ?? catalog.apiMenu?.fusion.find(candidate => candidate.id === item.id)?.resolved_default_powder_id;
  const powderId = item.category === "latte" ? item.matcha_powder_id : input.selected_powder_id ?? defaultPowderId;
  const powder = row(catalog.powders, powderId);
  invariant(powder, "ORACLE_POWDER_MISSING");
  const system = catalog.defaults.find(candidate => candidate.size === input.size);
  invariant(system, "ORACLE_SIZE_DEFAULT_MISSING");
  const grams = Number(item.custom_powder_grams?.[input.size]
    ?? powder.powderSizeConfigs?.find(candidate => candidate.size === input.size)?.grams
    ?? system.powder_gram);
  const baseLiquidMl = size.base_liquid_ml ?? system.milk_ml;
  const defaultLiquidId = item.category === "latte" ? catalog.liquids.find(candidate => candidate.is_default)?.id : item.default_base_liquid_id;
  const liquidId = input.selected_base_liquid_id ?? input.selected_milk_type_id ?? defaultLiquidId;
  const liquid = row(catalog.liquids, liquidId);
  invariant(liquid || (item.category === "fusion" && !defaultLiquidId), "ORACLE_LIQUID_MISSING");
  let liquidCost = baseLiquidMl * (liquid?.price_per_ml ?? 0);
  let premium = 0;
  if (item.category === "fusion") {
    liquidCost = defaultLiquidId ? baseLiquidMl * ((liquid?.price_per_ml ?? 0) - row(catalog.liquids, defaultLiquidId).price_per_ml) : 0;
    const defaultPowder = row(catalog.powders, defaultPowderId);
    const selectedReference = row(catalog.items, powder.reference_latte_item_id)?.sizes.find(candidate => candidate.size === input.size)?.base_price_vnd;
    const defaultReference = row(catalog.items, defaultPowder?.reference_latte_item_id)?.sizes.find(candidate => candidate.size === input.size)?.base_price_vnd;
    if (selectedReference != null && defaultReference != null) premium = selectedReference - defaultReference;
  }
  const drink = ceilMoney(Math.max(0, size.base_price_vnd + grams * powder.price_per_gram + liquidCost + premium));
  const addonsDetail = (input.addon_option_ids ?? []).map(selection => {
    const option = catalog.addonGroups.flatMap(group => group.options).find(candidate => candidate.id === selection.option_id);
    invariant(option, "ORACLE_ADDON_MISSING");
    const unitPrice = option.gram_value == null ? option.price_vnd : ceilMoney(Number(option.gram_value) * powder.price_per_gram);
    return { optionId: option.id, quantity: selection.quantity, unitPrice };
  });
  const addons = addonsDetail.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
  return { drink, addons, addonsDetail, powderId, liquidId, baseLiquidMl };
}

/** Quote order totals from frozen inputs, before dispatching any request. */
export function quoteOrder(catalog, payload, wallet = []) {
  const voucher = reference => wallet.find(candidate =>
    candidate.id === reference || candidate.qr_token === reference);
  let itemDiscount = 0;
  let surplus = 0;
  let subtotal = 0;
  for (const item of payload.items) {
    const quote = quoteLine(catalog, item);
    subtotal += (quote.drink + quote.addons) * item.quantity;
    const product = voucher(item.product_voucher_id ?? item.item_voucher_id);
    if (product?.voucher_type === "ITEM") itemDiscount += quote.drink;
    if (product?.voucher_type === "PRODUCT") {
      const covered = product.covered_price_vnd ?? 0;
      itemDiscount += Math.min(quote.drink, covered);
      surplus += Math.max(0, covered - quote.drink);
    }
    if (product?.voucher_type === "PRODUCT_DISCOUNT") {
      if (product.product_discount_mode === "FIXED_AMOUNT") itemDiscount += Math.min(quote.drink, product.discount_value ?? 0);
      else {
        prerequisite(product.product_discount_mode === "PAY_AS_SIZE" && product.reference_size, "ORACLE_PRODUCT_DISCOUNT_MODE_UNSUPPORTED");
        const reference = quoteLine(catalog, { ...item, size: product.reference_size, addon_option_ids: [] });
        itemDiscount += Math.max(0, quote.drink - reference.drink);
      }
    }
    const usedAddonOptions = new Set();
    for (const link of item.addon_voucher_ids ?? []) {
      const addonVoucher = voucher(link.voucher_id);
      if (addonVoucher?.voucher_type !== "ADDON"
        || addonVoucher.addon_option_id !== link.addon_option_id
        || usedAddonOptions.has(link.addon_option_id)) continue;
      const addon = quote.addonsDetail.find(candidate => candidate.optionId === link.addon_option_id);
      if (addon) { itemDiscount += addon.unitPrice; usedAddonOptions.add(link.addon_option_id); }
    }
  }
  let merchandise = Math.max(0, subtotal - itemDiscount);
  let orderDiscount = 0;
  const discounts = (payload.discount_voucher_ids ?? []).map(voucher).filter(Boolean);
  for (const discount of discounts.filter(candidate => candidate.discount_type === "FIXED")) {
    const benefit = Math.min(merchandise, discount.discount_value ?? 0);
    merchandise -= benefit; orderDiscount += benefit;
  }
  const percent = discounts.find(candidate => candidate.discount_type === "PERCENT");
  if (percent) {
    const benefit = Math.min(merchandise, Math.floor(merchandise * (percent.discount_value ?? 0) / 100 / 1_000) * 1_000);
    merchandise -= benefit; orderDiscount += benefit;
  }
  const shipping = payload.shipping_fee_vnd ?? 0;
  const freeship = voucher(payload.freeship_voucher_id);
  const freeshipDiscount = freeship?.voucher_type === "FREESHIP"
    ? Math.min(shipping, freeship.covered_delivery_fee_vnd ?? 0) : 0;
  return {
    subtotal_vnd: subtotal, item_discount_vnd: itemDiscount,
    total_voucher_discount_vnd: orderDiscount, total_vnd: merchandise,
    shipping_fee_vnd: shipping, freeship_discount_vnd: freeshipDiscount,
    grand_total_vnd: Math.max(0, merchandise + shipping - freeshipDiscount),
    orderPoints: Math.floor(merchandise / 10_000), surplusPoints: Math.floor(surplus / 10_000),
  };
}
