import { describe, expect, it, vi } from "vitest";
import { resolveBundleBaselineProducts } from "@/lib/pricing";

describe("Baseline BUNDLE theo effective fallback", () => {
  it("không tính phantom premium hoặc liquid delta khi raw default inactive", async () => {
    const client = {
      menuItem: { findMany: vi.fn().mockResolvedValue([{
        id: "fusion", category: "fusion", unit_price_vnd: null,
        default_powder_id: "powder-old", default_base_liquid_id: "liquid-old",
        matcha_powder_id: null, custom_powder_grams: null,
        sizes: [{ size: "SMALL", base_price_vnd: 40_000, base_liquid_ml: 100 }],
        allowedBaseLiquids: [{ base_liquid_id: "liquid-effective" }],
      }]) },
      defaultSizeConfig: { findMany: vi.fn().mockResolvedValue([{ size: "SMALL", milk_ml: 100, powder_gram: 0 }]) },
      powderSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
      matchaPowder: { findMany: vi.fn().mockResolvedValue([
        { id: "powder-effective", name: "Hana", price_per_gram: 0, is_available: true, reference_latte_item_id: "latte-effective" },
        { id: "powder-old", name: "Old", price_per_gram: 0, is_available: false, reference_latte_item_id: "latte-old" },
      ]) },
      milkType: { findMany: vi.fn().mockResolvedValue([
        { id: "liquid-effective", price_per_ml: 20, is_default: false, is_active: true, display_order: 1 },
        { id: "liquid-old", price_per_ml: 10, is_default: false, is_active: false, display_order: 0 },
      ]) },
      menuItemSize: { findMany: vi.fn().mockResolvedValue([
        { menu_item_id: "latte-effective", size: "SMALL", base_price_vnd: 50_000 },
        { menu_item_id: "latte-old", size: "SMALL", base_price_vnd: 30_000 },
      ]) },
    };
    const [baseline] = await resolveBundleBaselineProducts(client as never, [{
      menu_item_id: "fusion", allowed_sizes: ["SMALL"],
      default_powder_id: "powder-effective", default_base_liquid_id: "liquid-effective",
    }]);
    expect(baseline?.baseline_prices_vnd.SMALL).toBe(40_000);
  });
});
