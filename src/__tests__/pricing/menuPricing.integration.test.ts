/**
 * Integration test — Pricing validation against live API data.
 * Requires dev server running at http://localhost:3000 (or set TEST_BASE_URL).
 *
 * Run: npx vitest run src/__tests__/pricing/menuPricing.integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  resolveGram,
  calcLattePrice,
  calcFusionPrice,
  type Size,
  type DefaultSizeConfigEntry,
  type PowderSizeConfigEntry,
  type CustomPowderGrams,
} from "@/src/utils/pricing";
import type { MenuData, MenuItem, AddonGroup } from "@/src/lib/types/menu";
import type { PowderApiResponse, Powder } from "@/src/lib/types/powder";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

// ── Shared state loaded once ──────────────────────────────────────────────────

let menuData: MenuData;
let powderData: PowderApiResponse;
let defaultSizeConfigs: DefaultSizeConfigEntry[];

beforeAll(async () => {
  const [menuRes, powderRes] = await Promise.all([
    fetch(`${BASE_URL}/api/menu`),
    fetch(`${BASE_URL}/api/powders`),
  ]);

  if (!menuRes.ok) throw new Error(`GET /api/menu failed: ${menuRes.status}`);
  if (!powderRes.ok) throw new Error(`GET /api/powders failed: ${powderRes.status}`);

  const menuJson = await menuRes.json();
  menuData = menuJson.data as MenuData;
  powderData = (await powderRes.json()) as PowderApiResponse;

  defaultSizeConfigs = powderData.default_powder_gram.map((d) => ({
    size: d.size,
    milk_ml: 0,
    powder_gram: d.grams,
  }));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function findItem(items: MenuItem[], name: string): MenuItem {
  const item = items.find((i) =>
    i.name.toLowerCase().includes(name.toLowerCase())
  );
  if (!item) throw new Error(`Menu item not found: "${name}"`);
  return item;
}

function findPowder(name: string): Powder {
  const powder = powderData.data.find((p) =>
    p.name.toLowerCase().includes(name.toLowerCase())
  );
  if (!powder) throw new Error(`Powder not found: "${name}"`);
  return powder;
}

function getPowderSizeConfigs(powder: Powder): PowderSizeConfigEntry[] {
  return powder.size_config.map((c) => ({ size: c.size, grams: c.grams }));
}

/** Find addon option price by group name + option label (case-insensitive). */
function findAddonPrice(
  addonGroups: AddonGroup[],
  groupName: string,
  optionLabel: string
): number {
  const group = addonGroups.find((g) =>
    g.name.toLowerCase().includes(groupName.toLowerCase())
  );
  if (!group) throw new Error(`Addon group not found: "${groupName}"`);
  const option = group.options.find((o) =>
    o.label.toLowerCase().includes(optionLabel.toLowerCase())
  );
  if (!option) throw new Error(`Addon option not found: "${optionLabel}" in "${groupName}"`);
  return option.price_vnd;
}

/**
 * Computes Premium_Latte[size] = BaseLatte[selectedPowder][size] - BaseLatte[defaultPowder][size].
 * Queries DB for reference_latte_item_id (not exposed in public API).
 */
async function computePremiumLatte(
  selectedPowderId: string,
  defaultPowderId: string,
  size: Size
): Promise<number> {
  const [selectedPowderDb, defaultPowderDb] = await Promise.all([
    prisma.matchaPowder.findUnique({
      where: { id: selectedPowderId },
      select: { reference_latte_item_id: true },
    }),
    prisma.matchaPowder.findUnique({
      where: { id: defaultPowderId },
      select: { reference_latte_item_id: true },
    }),
  ]);

  if (!selectedPowderDb?.reference_latte_item_id || !defaultPowderDb?.reference_latte_item_id) {
    return 0;
  }

  const [selectedSize, defaultSize] = await Promise.all([
    prisma.menuItemSize.findFirst({
      where: { menu_item_id: selectedPowderDb.reference_latte_item_id, size },
    }),
    prisma.menuItemSize.findFirst({
      where: { menu_item_id: defaultPowderDb.reference_latte_item_id, size },
    }),
  ]);

  return (selectedSize?.base_price_vnd ?? 0) - (defaultSize?.base_price_vnd ?? 0);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe.skip("Menu Pricing Integration", () => {

  // ── Fusion ──────────────────────────────────────────────────────────────────

  describe("Fusion items", () => {

    it("Yuzu Matcha Latte size L, swap to MH-3, + nửa viên kem → 80,000 VND", async () => {
      const item = findItem(menuData.fusion, "Yuzu");
      const mh3  = powderData.data.find((p) => p.name.includes("MH-3") || p.name.includes("MH3"));
      if (!mh3) throw new Error("MH-3 powder not found");

      const size: Size = "L";
      const sizeData = item.sizes.find((s) => s.size === size);
      expect(sizeData).toBeDefined();

      const gram = resolveGram(size, null, getPowderSizeConfigs(mh3), defaultSizeConfigs);
      const premiumLatte = await computePremiumLatte(
        mh3.id,
        item.resolved_default_powder_id!,
        size
      );

      const basePrice = calcFusionPrice({
        base_price_vnd: sizeData!.base_price_vnd,
        gram,
        powder_price_per_gram: mh3.price_per_gram,
        premium_latte: premiumLatte,
      });

      // Addon: nửa viên kem
      const kemPrice = findAddonPrice(item.addon_groups, "kem", "nửa");

      const total = basePrice + kemPrice;
      expect(total).toBe(80_000);
    });

    it("Usucha size M → 50,000 VND", async () => {
      const item = findItem(menuData.fusion, "Usucha");
      const size: Size = "M";
      const sizeData = item.sizes.find((s) => s.size === size);
      expect(sizeData).toBeDefined();

      const defaultPowder = powderData.data.find(
        (p) => p.id === item.resolved_default_powder_id
      );
      expect(defaultPowder).toBeDefined();

      const gram = resolveGram(size, item.custom_powder_grams, getPowderSizeConfigs(defaultPowder!), defaultSizeConfigs);

      // Default powder = no swap → premium_latte = 0
      const price = calcFusionPrice({
        base_price_vnd: sizeData!.base_price_vnd,
        gram,
        powder_price_per_gram: defaultPowder!.price_per_gram,
        premium_latte: 0,
      });

      expect(price).toBe(50_000);
    });
  });

  // ── Latte ───────────────────────────────────────────────────────────────────

  describe("Latte items", () => {

    it("Shiro Latte size XL → 90,000 VND", () => {
      const item = findItem(menuData.latte, "Shiro");
      expect(item.powder).not.toBeNull();

      const size: Size = "XL";
      const sizeData = item.sizes.find((s) => s.size === size);
      expect(sizeData).toBeDefined();

      const powder = powderData.data.find((p) => p.id === item.powder!.id);
      expect(powder).toBeDefined();

      const defaultMilk = item.milk_types.find((m) => m.is_default);
      expect(defaultMilk).toBeDefined();

      const gram = resolveGram(size, null, getPowderSizeConfigs(powder!), defaultSizeConfigs);

      const price = calcLattePrice({
        base_price_vnd: sizeData!.base_price_vnd,
        gram,
        powder_price_per_gram: powder!.price_per_gram,
        milk_ml: sizeData!.milk_ml,
        milk_price_per_ml: defaultMilk!.price_per_ml,
      });

      expect(price).toBe(90_000);
    });

    it("Meyumi size L + 1 cục kem + đá dừa → 83,000 VND", () => {
      const item = findItem(menuData.latte, "Meyumi");
      expect(item.powder).not.toBeNull();

      const size: Size = "L";
      const sizeData = item.sizes.find((s) => s.size === size);
      expect(sizeData).toBeDefined();

      const powder = powderData.data.find((p) => p.id === item.powder!.id);
      expect(powder).toBeDefined();

      const defaultMilk = item.milk_types.find((m) => m.is_default);
      expect(defaultMilk).toBeDefined();

      const gram = resolveGram(size, null, getPowderSizeConfigs(powder!), defaultSizeConfigs);

      const basePrice = calcLattePrice({
        base_price_vnd: sizeData!.base_price_vnd,
        gram,
        powder_price_per_gram: powder!.price_per_gram,
        milk_ml: sizeData!.milk_ml,
        milk_price_per_ml: defaultMilk!.price_per_ml,
      });

      // Addon: 1 cục kem + đá dừa (TOGGLE — toggled on means 1 option selected)
      const kemPrice    = findAddonPrice(item.addon_groups, "kem", "1");
      const daCuaPrice  = findAddonPrice(item.addon_groups, "đá dừa", "");

      const total = basePrice + kemPrice + daCuaPrice;
      expect(total).toBe(83_000);
    });
  });
});
