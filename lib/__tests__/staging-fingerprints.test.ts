// @vitest-environment node

import { describe, expect, it } from "vitest";
import { publicCatalogFingerprintFromApi, publicCatalogFingerprintFromDatabase } from "../../scripts/staging-tests/fingerprints.mjs";

describe("Fingerprint staging — API và database", () => {
  it("khớp cùng catalog dù thứ tự và kiểu Decimal khác nhau", () => {
    const database = { items: [{ id: "i", name: "Latte", category: "latte", unit_price_vnd: null, is_available: true,
      matcha_powder_id: "p", custom_powder_grams: null, sizes: [{ size: "SMALL", base_price_vnd: 10_000, base_liquid_ml: null }],
      fusionAllowedPowders: [], allowedBaseLiquids: [] }],
      powders: [{ id: "p", name: "P", price_per_gram: 1000, reference_latte_item_id: "i", is_available: true, powderSizeConfigs: [] }],
      defaults: [{ size: "SMALL", powder_gram: "3.5", milk_ml: 130 }],
      liquids: [{ id: "m", name: "Milk", price_per_ml: 10, is_default: true, is_active: true }], addonGroups: [] };
    const menu = { data: { latte: [{ id: "i", name: "Latte", category: "latte", unit_price_vnd: null,
      custom_powder_grams: null, sizes: [{ size: "SMALL", base_price_vnd: 10_000, milk_ml: 130 }],
      allowed_powder_ids: [], default_base_liquid_id: "m", allowed_base_liquid_ids: [] }], fusion: [], extras: [],
      base_liquids: [{ id: "m", name: "Milk", price_per_ml: 10, is_default: true }], milk_types: [], addon_groups: [] } };
    const powders = { data: [{ id: "p", name: "P", price_per_gram: 1000, reference_latte_item_id: "i", size_config: [] }],
      default_powder_gram: [{ size: "SMALL", grams: 3.5 }] };
    expect(publicCatalogFingerprintFromApi(menu, powders)).toBe(publicCatalogFingerprintFromDatabase(database));
  });
});
