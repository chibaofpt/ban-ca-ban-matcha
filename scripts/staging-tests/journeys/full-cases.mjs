import { buildPickupCase } from "./common.mjs";
import { prerequisite } from "../errors.mjs";

/** Select bounded representative price configurations without inventing staging catalog data. */
export function selectPriceCases(catalog) {
  const cases = [];
  const defaultLiquid = item => item.category === "latte" ? catalog.liquids.find(liquid => liquid.is_default)?.id
    : item.default_base_liquid_id;
  const alternativeLiquid = (item, link) => link.base_liquid_id !== defaultLiquid(item)
    && catalog.liquids.some(liquid => liquid.id === link.base_liquid_id && liquid.is_active !== false);
  for (const category of ["latte", "fusion", "extras"]) {
    for (const size of category === "extras" ? [null] : ["SMALL", "MEDIUM", "LARGE"]) {
      const item = catalog.items.find(item => item.is_available && item.category === category
        && (!size || item.sizes?.some(row => row.size === size && row.base_price_vnd != null)));
      cases.push({ id: `price-${category}-${size?.toLowerCase() ?? "fixed"}`,
        lineInput: item ? { menu_item_id: item.id, ...(size ? { size } : {}), quantity: 1, addon_option_ids: [] } : null });
    }
  }
  for (const category of ["latte", "fusion"]) {
    const item = catalog.items.find(item => item.is_available && item.category === category
      && item.sizes?.some(size => size.base_price_vnd != null)
      && item.allowedBaseLiquids?.some(link => alternativeLiquid(item, link)));
    const liquid = item?.allowedBaseLiquids?.find(link => alternativeLiquid(item, link));
    cases.push({ id: `price-${category}-liquid-swap`, lineInput: item ? {
      menu_item_id: item.id, size: item.sizes.find(size => size.base_price_vnd != null).size,
      selected_base_liquid_id: liquid.base_liquid_id, quantity: 1, addon_option_ids: [],
    } : null });
  }
  const defaultPowder = item => item.default_powder_id
    ?? catalog.apiMenu?.fusion?.find(candidate => candidate.id === item.id)?.resolved_default_powder_id;
  const fusion = catalog.items.find(item => item.is_available && item.category === "fusion"
    && item.sizes?.some(size => size.base_price_vnd != null)
    && item.fusionAllowedPowders?.some(link => link.powder_id !== defaultPowder(item)
      && catalog.powders.some(powder => powder.id === link.powder_id && powder.is_available !== false)));
  cases.push({ id: "price-fusion-powder-swap", lineInput: fusion ? {
    menu_item_id: fusion.id, size: fusion.sizes.find(size => size.base_price_vnd != null).size, quantity: 1,
    selected_powder_id: fusion.fusionAllowedPowders.find(link => link.powder_id !== defaultPowder(fusion)
      && catalog.powders.some(powder => powder.id === link.powder_id && powder.is_available !== false)).powder_id,
    addon_option_ids: [],
  } : null });
  const addonDrink = catalog.items.find(item => item.is_available && ["latte", "fusion"].includes(item.category)
    && item.sizes?.some(size => size.base_price_vnd != null));
  const addonBase = addonDrink ? { menu_item_id: addonDrink.id,
    size: addonDrink.sizes.find(size => size.base_price_vnd != null).size, quantity: 1 } : null;
  cases.push({ id: "addon-opt-in-none", lineInput: addonBase ? { ...addonBase, addon_option_ids: [] } : null });
  const activeGroups = (catalog.addonGroups ?? []).filter(group => group.is_active !== false);
  const addonCase = (id, groupPredicate, optionPredicate = () => true, quantity = () => 1) => {
    const group = activeGroups.find(candidate => groupPredicate(candidate)
      && candidate.options?.some(option => option.is_active !== false && optionPredicate(option)));
    const option = group?.options.find(candidate => candidate.is_active !== false && optionPredicate(candidate));
    cases.push({ id, lineInput: addonBase && option ? { ...addonBase,
      addon_option_ids: [{ option_id: option.id, quantity: quantity(group) }] } : null });
  };
  addonCase("addon-selector", group => group.type === "SELECTOR");
  addonCase("addon-toggle", group => group.type === "TOGGLE");
  addonCase("addon-quantity", group => group.type === "QUANTITY", () => true,
    group => Math.max(1, Math.min(2, group.max_quantity ?? 2)));
  addonCase("addon-extra-matcha-gram", () => true, option => option.gram_value != null);
  addonCase("addon-fixed-price-fallback", () => true, option => option.gram_value == null);
  return cases;
}

/** Find a real, eligible, positive-benefit configuration before acquiring a voucher. */
export function selectVoucherCase({ catalog, runId, caseId, voucher }) {
  prerequisite(!["BUNDLE", "FREESHIP"].includes(voucher.voucher_type), `FULL_${voucher.voucher_type}_CAPABILITY_MISSING`);
  if (voucher.voucher_type === "DISCOUNT") return buildPickupCase({ catalog, runId, caseId, voucher });
  const targets = voucher.voucher_type === "PRODUCT_DISCOUNT" && voucher.menuItemScopes?.length
    ? voucher.menuItemScopes.map(scope => scope.menu_item_id) : [voucher.menu_item_id];
  const items = catalog.items.filter(item => item.is_available
    && (voucher.voucher_type === "ADDON" ? ["latte", "fusion"].includes(item.category) : targets.includes(item.id))
    && (voucher.voucher_type === "ITEM" ? item.category === "extras" : item.category !== "extras"));
  let lastGap;
  for (const item of items) {
    for (const size of item.category === "extras" ? [null] : item.sizes.filter(size => size.base_price_vnd != null).map(size => size.size)) {
      try {
        return buildPickupCase({ catalog, runId, caseId, voucher, lineInput: {
          menu_item_id: item.id, ...(size ? { size } : {}), quantity: 1,
          addon_option_ids: voucher.voucher_type === "ADDON" ? [{ option_id: voucher.addon_option_id, quantity: 1 }] : [],
        } });
      } catch (error) {
        if (error.status !== "PARTIAL") throw error;
        lastGap = error;
      }
    }
  }
  if (lastGap) throw lastGap;
  prerequisite(false, "FULL_VOUCHER_ELIGIBLE_TARGET_MISSING");
}
