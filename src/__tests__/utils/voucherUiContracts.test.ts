import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmptyVoucherDraft, suggestVoucherCopy } from "@/src/lib/utils/adminVoucherForm";
import { getPackageBenefitText } from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("multi-choice voucher UI contracts", () => {
  it("wires BUNDLE allocation into every ADDON use-now picker and applies atomically", () => {
    const detail = readSource("../../components/shared/VoucherDetailSheet.tsx");
    const modal = readSource("../../components/shared/VoucherModal.tsx");
    const cartDiscount = readSource("../../components/menu/cart/CartDiscountPicker.tsx");
    const addonPicker = readSource("../../components/shared/AddonItemPicker.tsx");

    expect(detail).toContain("bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}");
    expect(detail).toContain("bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>");
    expect(modal).toContain("bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}");
    expect(cartDiscount).toContain("bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}");
    expect(cartDiscount).toMatch(/<VoucherDetailSheet[\s\S]*?bundleAllocatedQuantitiesByCartId=\{bundleAllocatedQuantitiesByCartId\}/);
    expect(addonPicker).toContain("bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>");
    expect(addonPicker).toContain("const result = applyAddonVoucher(");
    expect(addonPicker).not.toContain("updateItem(");
    expect(detail).toContain("Lựa chọn còn dùng được");
    expect(detail).toContain("target.covered_price_vnd");
    expect(detail).toContain("Topping được chọn");
  });

  it("leaves a multi-target ADDON voucher for explicit cart selection after reorder", () => {
    const reorderHook = readSource("../../hooks/useReorderItem.ts");

    expect(reorderHook).toContain("getAddonVoucherTargetChoices");
    expect(reorderHook).toContain("targetChoices.length === 1");
    expect(reorderHook).not.toContain("resolveAddonVoucherOptionId(voucher, addonIds");
  });

  it("requires an explicit target choice in customer, product and staff ADDON paths", () => {
    for (const path of [
      "../../components/menu/cart/CartItemVoucherPicker.tsx",
      "../../components/shared/ProductModal.tsx",
      "../../components/staff/StaffCartDrawer.tsx",
    ]) {
      expect(readSource(path)).toContain("getAddonVoucherTargetChoices");
    }
  });

  it("describes multi-choice packages without advertising only the legacy anchor", () => {
    const pkg = {
      voucher_type: "ADDON",
      eligible_addon_options: [
        { addon_option_id: "a", label: "A", price_vnd: 5_000, is_active: true, is_dynamic_gram: false },
        { addon_option_id: "b", label: "B", price_vnd: 15_000, is_active: true, is_dynamic_gram: false },
      ],
      addonOption: { label: "A" },
      description: null,
    } as VoucherPackage;
    expect(getPackageBenefitText(pkg)).toBe("Chọn 1 trong 2 topping miễn phí");

    const draft = { ...createEmptyVoucherDraft(), voucherType: "ITEM" as const, menuItemId: "a", eligibleMenuItemIds: ["a", "b"] };
    const copy = suggestVoucherCopy(draft, {
      menuLabels: new Map([["a", "Bánh A"], ["b", "Bánh B"]]),
      addonLabels: new Map(), powderLabels: new Map(), milkLabels: new Map(),
      defaultPowderByMenuId: new Map(), defaultMilkByMenuId: new Map(),
    });
    expect(copy).toEqual({ name: "Free 1 trong 2 món", description: "Tặng 1 trong 2 món đã chọn: Bánh A, Bánh B." });
  });
});
