import { describe, expect, it } from "vitest";
import { createEmptyVoucherDraft, describeProductDiscountTargets, suggestVoucherCopy } from "@/src/lib/utils/adminVoucherForm";
import { getPackageBenefitText } from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

describe("multi-choice voucher presentation helpers", () => {
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

  it("tạo copy free upsize và dòng món áp dụng theo đúng cặp size", () => {
    const draft = {
      ...createEmptyVoucherDraft(),
      voucherType: "PRODUCT_DISCOUNT" as const,
      productDiscountMode: "PAY_AS_SIZE" as const,
      eligibleMenuItemIds: ["a", "b"],
      referenceSize: "SMALL" as const,
      eligibleSizes: ["MEDIUM" as const],
    };
    const labels = {
      menuLabels: new Map([["a", "Matcha A"], ["b", "Matcha B"]]),
      addonLabels: new Map(), powderLabels: new Map(), milkLabels: new Map(),
      defaultPowderByMenuId: new Map(), defaultMilkByMenuId: new Map(),
    };

    expect(suggestVoucherCopy(draft, labels)).toEqual({
      name: "Free upsize lên cá vừa",
      description: "Free up size cho Matcha A, Matcha B lên size vừa.",
    });
    expect(describeProductDiscountTargets(draft, labels.menuLabels)).toBe(
      "Món áp dụng: Matcha A, Matcha B size vừa",
    );
  });
});
