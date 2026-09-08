import { describe, expect, it } from "vitest";
import { getBundleScopeCompatibility } from "@/src/lib/utils/adminVoucherBundleScopes";
import type { BundleMenuConfig, BundleProductScopeDraft } from "@/src/lib/utils/adminVoucherBundle";

const menu = (overrides: Partial<BundleMenuConfig>): BundleMenuConfig => ({
  id: "menu-a",
  name: "Trà",
  category: "latte",
  availableSizes: ["SMALL", "MEDIUM", "LARGE"],
  fixedPowderId: "powder-a",
  defaultPowderId: "powder-a",
  defaultBaseLiquidId: "milk-a",
  availablePowderIds: ["powder-a"],
  availableBaseLiquidIds: ["milk-a", "milk-b"],
  ...overrides,
});

const scope = (menuItemId: string, sizes: BundleProductScopeDraft["sizes"], milkTypeIds: string[]) => ({
  menuItemId,
  category: "latte" as const,
  sizes,
  powderIds: [],
  milkTypeIds,
  fixedPowderId: "powder-a",
});

describe("Giao cấu hình BUNDLE trong wizard", () => {
  it("tính giao size và Base Liquid theo các món đồ uống", () => {
    const result = getBundleScopeCompatibility(
      [scope("menu-a", ["MEDIUM"], ["milk-a"]), scope("menu-b", ["MEDIUM"], ["milk-a"])],
      [menu({}), menu({ id: "menu-b", name: "Fusion", category: "fusion", fixedPowderId: null, defaultPowderId: "powder-b", availablePowderIds: ["powder-b"], availableSizes: ["MEDIUM", "LARGE"], availableBaseLiquidIds: ["milk-a"], defaultBaseLiquidId: "milk-a" })],
    );
    expect(result.commonSizes).toEqual(["MEDIUM", "LARGE"]);
    expect(result.commonBaseLiquidIds).toEqual(["milk-a"]);
    expect(result.selectedSizes).toEqual(["MEDIUM"]);
    expect(result.selectedBaseLiquidId).toBe("milk-a");
    expect(result.conflictingMenuItemIds).toEqual([]);
  });

  it("tách giao khả dụng khỏi lựa chọn cũ đang xung đột", () => {
    const result = getBundleScopeCompatibility(
      [scope("menu-a", ["SMALL"], ["milk-a"]), scope("menu-b", ["LARGE"], ["milk-b"])],
      [menu({}), menu({ id: "menu-b", name: "Fusion", category: "fusion", fixedPowderId: null, defaultPowderId: "powder-b", availablePowderIds: ["powder-b"], availableSizes: ["LARGE"], availableBaseLiquidIds: ["milk-b"], defaultBaseLiquidId: "milk-b" })],
    );
    expect(result.commonSizes).toEqual(["LARGE"]);
    expect(result.commonBaseLiquidIds).toEqual(["milk-b"]);
    expect(result.selectedSizes).toEqual([]);
    expect(result.selectedBaseLiquidId).toBeNull();
    expect(result.conflictingMenuItemIds).toEqual(["menu-a"]);
  });
});
