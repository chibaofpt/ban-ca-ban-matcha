import { describe, expect, it } from "vitest";
import { adminVoucherDraftSchema, getAdminVoucherStep2FieldPaths } from "@/src/lib/validations/adminVoucher";
import { buildVoucherInput, createEmptyVoucherDraft, estimateVoucherLiabilityVnd } from "@/src/lib/utils/adminVoucherForm";

describe("Kiểm tra bản nháp voucher quản trị", () => {
  const issuePaths = (draft: Parameters<typeof adminVoucherDraftSchema.parse>[0]): Array<Array<string | number>> => {
    const result = adminVoucherDraftSchema.safeParse(draft);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"));
  };

  it("khai báo đúng field path của bước quyền lợi theo từng loại voucher", () => {
    expect(getAdminVoucherStep2FieldPaths("BUNDLE")).toEqual(expect.arrayContaining([
      "buyQuantity", "rewardQuantity", "qualifierScopes", "rewardProductScopes", "rewardAddonOptionIds",
    ]));
    expect(getAdminVoucherStep2FieldPaths("PRODUCT_DISCOUNT")).toEqual(expect.arrayContaining([
      "eligibleMenuItemIds", "eligibleSizes", "referenceSize",
    ]));
    expect(getAdminVoucherStep2FieldPaths("FREESHIP")).toEqual(expect.arrayContaining(["coveredDeliveryFeeVnd", "minOrderVnd"]));
  });

  it("gắn lỗi parity tiền và giới hạn theo đúng path field", () => {
    const base = { ...createEmptyVoucherDraft(), name: "Voucher" };
    expect(issuePaths({ ...base, voucherType: "DISCOUNT", discountValue: 101 })).toContainEqual(["discountValue"]);
    expect(issuePaths({ ...base, voucherType: "DISCOUNT", discountType: "FIXED", discountValue: 12_500 })).toContainEqual(["discountValue"]);
    expect(issuePaths({ ...base, voucherType: "DISCOUNT", minOrderVnd: 999 })).toContainEqual(["minOrderVnd"]);
    expect(issuePaths({ ...base, voucherType: "FREESHIP", coveredDeliveryFeeVnd: 999 })).toContainEqual(["coveredDeliveryFeeVnd"]);
    expect(issuePaths({ ...base, maxPerUser: 101 })).toContainEqual(["maxPerUser"]);
  });

  it("giữ yêu cầu sản phẩm cho voucher PRODUCT trước khi sang bước phát hành", () => {
    const draft = { ...createEmptyVoucherDraft(), name: "Tặng ly", voucherType: "PRODUCT" as const };
    expect(adminVoucherDraftSchema.safeParse(draft).success).toBe(false);
    expect(adminVoucherDraftSchema.safeParse({
      ...draft,
      menuItemId: "menu-1",
      productTargets: [{ menuItemId: "menu-1", category: "fusion", sizes: ["MEDIUM"], powderIds: ["powder-1"], milkTypeIds: ["milk-1"], fixedPowderId: null }],
    }).success).toBe(true);
  });

  it("serialize cấu hình và credit đầu vào PRODUCT độc lập theo từng món", () => {
    const input = buildVoucherInput({
      ...createEmptyVoucherDraft(),
      name: "Chọn một ly",
      voucherType: "PRODUCT",
      menuItemId: "menu-a",
      productTargets: [
        { menuItemId: "menu-a", category: "latte", sizes: ["SMALL"], powderIds: [], milkTypeIds: ["milk-a"], fixedPowderId: "powder-a" },
        { menuItemId: "menu-b", category: "fusion", sizes: ["LARGE"], powderIds: ["powder-b"], milkTypeIds: ["milk-b"], fixedPowderId: null },
      ],
    });
    expect(input).toMatchObject({
      voucher_type: "PRODUCT",
      menu_item_id: "menu-a",
      size: "SMALL",
      product_targets: [
        { menu_item_id: "menu-a", size: "SMALL", matcha_powder_id: null, milk_type_id: "milk-a" },
        { menu_item_id: "menu-b", size: "LARGE", matcha_powder_id: "powder-b", milk_type_id: "milk-b" },
      ],
    });
  });

  it("serialize cùng multi-select contract cho PRODUCT_DISCOUNT, ITEM và ADDON", () => {
    const base = { ...createEmptyVoucherDraft(), name: "Multi" };
    expect(buildVoucherInput({ ...base, voucherType: "PRODUCT_DISCOUNT", menuItemId: "menu-a", eligibleMenuItemIds: ["menu-a", "menu-b"] })).toMatchObject({ eligible_menu_item_ids: ["menu-a", "menu-b"] });
    expect(buildVoucherInput({ ...base, voucherType: "ITEM", menuItemId: "extra-a", eligibleMenuItemIds: ["extra-a", "extra-b"] })).toMatchObject({ eligible_menu_item_ids: ["extra-a", "extra-b"] });
    expect(buildVoucherInput({ ...base, voucherType: "ADDON", addonOptionId: "addon-a", eligibleAddonOptionIds: ["addon-a", "addon-b"] })).toMatchObject({ eligible_addon_option_ids: ["addon-a", "addon-b"] });
  });

  it("ước tính liability ITEM và ADDON theo target đắt nhất trong multi-select", () => {
    const base = { ...createEmptyVoucherDraft(), name: "Liability", quantity: 2 };
    expect(estimateVoucherLiabilityVnd(
      { ...base, voucherType: "ITEM", menuItemId: "extra-a", eligibleMenuItemIds: ["extra-a", "extra-b"] },
      new Map([["extra-a", 5_000], ["extra-b", 12_000]]),
      new Map(),
    )).toBe(24_000);
    expect(estimateVoucherLiabilityVnd(
      { ...base, voucherType: "ADDON", addonOptionId: "addon-a", eligibleAddonOptionIds: ["addon-a", "addon-b"] },
      new Map(),
      new Map([["addon-a", 7_000], ["addon-b", 10_000]]),
    )).toBe(20_000);
  });

  it("gắn lỗi cấu hình BUNDLE vào đúng nhóm và trường con", () => {
    const draft = {
      ...createEmptyVoucherDraft(),
      name: "Mua 2 tặng 1",
      voucherType: "BUNDLE" as const,
      qualifierScopes: [{ menuItemId: "menu-1", category: "fusion" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: null }],
    };
    const result = adminVoucherDraftSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        ["qualifierScopes", 0, "sizes"],
        ["qualifierScopes", 0, "milkTypeIds"],
        ["qualifierScopes", 0, "powderIds"],
      ]));
    }
  });

  it("gắn lỗi các selector BUNDLE còn thiếu vào đúng trường con", () => {
    const qualifier = { menuItemId: "menu-1", category: "fusion" as const, sizes: ["SMALL"] as Array<"SMALL" | "MEDIUM" | "LARGE">, powderIds: ["powder-1"], milkTypeIds: ["milk-1"], fixedPowderId: null };
    const addonResult = adminVoucherDraftSchema.safeParse({
      ...createEmptyVoucherDraft(), name: "Addon", voucherType: "BUNDLE" as const, qualifierScopes: [qualifier], rewardKind: "ADDON" as const,
    });
    expect(addonResult.success).toBe(false);
    if (!addonResult.success) expect(addonResult.error.issues.map((issue) => issue.path)).toContainEqual(["rewardAddonOptionIds"]);

    const fixedResult = adminVoucherDraftSchema.safeParse({
      ...createEmptyVoucherDraft(), name: "Quà", voucherType: "BUNDLE" as const, qualifierScopes: [qualifier], rewardMode: "ALLOWED_SCOPE" as const,
    });
    expect(fixedResult.success).toBe(false);
    if (!fixedResult.success) expect(fixedResult.error.issues.map((issue) => issue.path)).toContainEqual(["rewardProductScopes"]);

    const latteResult = adminVoucherDraftSchema.safeParse({
      ...createEmptyVoucherDraft(), name: "Latte", voucherType: "BUNDLE" as const,
      qualifierScopes: [{ ...qualifier, category: "latte" as const, fixedPowderId: null }],
    });
    expect(latteResult.success).toBe(false);
    if (!latteResult.success) expect(latteResult.error.issues.map((issue) => issue.path)).toContainEqual(["qualifierScopes", 0, "fixedPowderId"]);
  });

  it("bắt quantity, lượt và đơn tối thiểu sai ngay tại field", () => {
    const draft = { ...createEmptyVoucherDraft(), name: "Giới hạn", voucherType: "BUNDLE" as const,
      qualifierScopes: [{ menuItemId: "menu-1", category: "extras" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: null }],
      buyQuantity: 0, maxApplications: 0, minOrderVnd: 999 };
    const paths = issuePaths(draft);
    expect(paths).toEqual(expect.arrayContaining([["buyQuantity"], ["maxApplications"], ["minOrderVnd"]]));
  });

  it("serialize PRIVATE package thành NONE và không gửi chi phí điểm", () => {
    const input = buildVoucherInput({
      ...createEmptyVoucherDraft(),
      name: "Tặng riêng",
      visibility: "PRIVATE",
      acquisitionMode: "POINTS_EXCHANGE",
      pointsCost: 99,
      voucherType: "DISCOUNT",
    });

    expect(input).toMatchObject({
      visibility: "PRIVATE",
      acquisition_mode: "NONE",
      points_cost: 0,
    });
  });
});
