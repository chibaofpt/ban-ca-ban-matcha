import { fingerprint } from "./database.mjs";

const byId = rows => new Map(rows.map(row => [row.id, row]));
const sorted = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

function sizeRows(rows, defaults) {
  const fallback = new Map(defaults.map(row => [row.size, row.milk_ml]));
  return sorted(rows.filter(row => row.base_price_vnd != null).map(row => ({
    size: row.size, base_price_vnd: row.base_price_vnd,
    base_liquid_ml: row.base_liquid_ml ?? row.milk_ml ?? fallback.get(row.size) ?? 0,
  })));
}

function databaseProjection(catalog) {
  const activePowders = catalog.powders.filter(row => row.is_available);
  const powderMap = byId(activePowders);
  const activeLiquids = catalog.liquids.filter(row => row.is_active);
  const liquidIds = new Set(activeLiquids.map(row => row.id));
  const defaultLiquid = activeLiquids.find(row => row.is_default)?.id ?? null;
  const items = catalog.items.filter(item => item.is_available
    && (item.category !== "latte" || powderMap.has(item.matcha_powder_id))).map(item => ({
      id: item.id, name: item.name, category: item.category, unit_price_vnd: item.unit_price_vnd,
      custom_powder_grams: item.custom_powder_grams ?? null,
      sizes: sizeRows(item.sizes, catalog.defaults),
      allowed_powder_ids: sorted((item.fusionAllowedPowders ?? []).map(row => row.powder_id).filter(id => powderMap.has(id))),
      default_base_liquid_id: item.category === "latte" ? defaultLiquid
        : liquidIds.has(item.default_base_liquid_id) ? item.default_base_liquid_id : null,
      allowed_base_liquid_ids: sorted((item.allowedBaseLiquids ?? []).map(row => row.base_liquid_id).filter(id => liquidIds.has(id))),
    }));
  return {
    items: sorted(items),
    powders: sorted(activePowders.map(row => ({ id: row.id, name: row.name, price_per_gram: row.price_per_gram,
      reference_latte_item_id: row.reference_latte_item_id, size_config: sorted((row.powderSizeConfigs ?? []).map(entry => ({ size: entry.size, grams: Number(entry.grams) }))) }))),
    defaults: sorted(catalog.defaults.map(row => ({ size: row.size, grams: Number(row.powder_gram) }))),
    liquids: sorted(activeLiquids.map(row => ({ id: row.id, name: row.name, price_per_ml: row.price_per_ml, is_default: row.is_default }))),
    addons: sorted(catalog.addonGroups.filter(row => row.is_active).map(group => ({ id: group.id, name: group.name, type: group.type,
      options: sorted(group.options.filter(row => row.is_active).map(row => ({ id: row.id, label: row.label, price_vnd: row.price_vnd, gram_value: row.gram_value == null ? null : Number(row.gram_value) }))) }))),
  };
}

function apiProjection(menu, powders) {
  const data = menu.data;
  const items = [...data.latte, ...data.fusion, ...(data.extras ?? [])].map(item => ({
    id: item.id, name: item.name, category: item.category, unit_price_vnd: item.unit_price_vnd ?? null,
    custom_powder_grams: item.custom_powder_grams ?? null,
    sizes: sizeRows(item.sizes ?? [], []),
    allowed_powder_ids: sorted(item.allowed_powder_ids ?? []),
    default_base_liquid_id: item.default_base_liquid_id ?? null,
    allowed_base_liquid_ids: sorted(item.allowed_base_liquid_ids ?? []),
  }));
  return {
    items: sorted(items),
    powders: sorted(powders.data.map(row => ({ id: row.id, name: row.name, price_per_gram: row.price_per_gram,
      reference_latte_item_id: row.reference_latte_item_id, size_config: sorted(row.size_config.map(entry => ({ size: entry.size, grams: Number(entry.grams) }))) }))),
    defaults: sorted(powders.default_powder_gram.map(row => ({ size: row.size, grams: Number(row.grams) }))),
    liquids: sorted((data.base_liquids ?? data.milk_types).map(row => ({ id: row.id, name: row.name, price_per_ml: row.price_per_ml, is_default: row.is_default }))),
    addons: sorted(data.addon_groups.map(group => ({ id: group.id, name: group.name, type: group.type,
      options: sorted(group.options.map(row => ({ id: row.id, label: row.label, price_vnd: row.price_vnd, gram_value: row.gram_value == null ? null : Number(row.gram_value) }))) }))),
  };
}

export const publicCatalogFingerprintFromDatabase = catalog => fingerprint(databaseProjection(catalog));
export const publicCatalogFingerprintFromApi = (menu, powders) => fingerprint(apiProjection(menu, powders));
