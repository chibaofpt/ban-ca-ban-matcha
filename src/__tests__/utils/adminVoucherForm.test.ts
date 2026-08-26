import { describe, expect, it } from "vitest";
import {
  buildVoucherInput,
  createEmptyVoucherDraft,
  describeVoucherDraft,
  estimateVoucherLiabilityVnd,
  formatInclusiveEndDate,
  suggestVoucherCopy,
  toExclusiveEndIso,
  validateVoucherDraft,
} from "@/src/lib/utils/adminVoucherForm";

describe("Form quản lý voucher hợp nhất", () => {
  it("voucher miễn phí luôn gửi points_cost bằng 0", () => {
    const draft = { ...createEmptyVoucherDraft(), acquisitionMode: "FREE_CLAIM" as const, pointsCost: 99 };
    expect(buildVoucherInput(draft).points_cost).toBe(0);
  });

  it("voucher đổi điểm giữ nguyên giá điểm", () => {
    const draft = { ...createEmptyVoucherDraft(), acquisitionMode: "POINTS_EXCHANGE" as const, pointsCost: 25 };
    expect(buildVoucherInput(draft).points_cost).toBe(25);
  });

  it("không cho qua bước review khi thiếu phạm vi BUNDLE", () => {
    const draft = { ...createEmptyVoucherDraft(), name: "Mua 2 tặng 1", voucherType: "BUNDLE" as const, qualifierScopes: [] };
    expect(validateVoucherDraft(draft)).toContain("món điều kiện");
  });

  it("không yêu cầu ngày kết thúc", () => {
    const draft = { ...createEmptyVoucherDraft(), endsAt: "" };
    expect(buildVoucherInput(draft).ends_at).toBeNull();
  });

  it("lưu hết ngày đã chọn theo mốc 00:00 ngày kế tiếp tại Việt Nam", () => {
    expect(toExclusiveEndIso("2026-08-20")).toBe("2026-08-20T17:00:00.000Z");
    expect(formatInclusiveEndDate("2026-08-20T17:00:00.000Z")).toBe("20/8/2026");
  });

  it("tạo mô tả review BUNDLE từ rule và tên món", () => {
    const draft = {
      ...createEmptyVoucherDraft(),
      voucherType: "BUNDLE" as const,
      name: "Mua hai tặng một",
      qualifierScopes: [
        { menuItemId: "latte-1", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p1", referencePriceVnd: 50_000 },
        { menuItemId: "latte-2", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p2", referencePriceVnd: 50_000 },
      ],
      rewardProductScopes: [{ menuItemId: "latte-3", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p3", referencePriceVnd: 50_000 }],
      rewardMode: "ALLOWED_SCOPE" as const,
    };
    expect(describeVoucherDraft(draft, new Map([
      ["latte-1", "Matcha Latte"], ["latte-2", "Hojicha"], ["latte-3", "Seasonal"],
    ]), new Map())).toContain("Matcha Latte, Hojicha");
  });

  it("ước tính trần chi phí theo số voucher và số nhóm tối đa", () => {
    const draft = {
      ...createEmptyVoucherDraft(),
      voucherType: "BUNDLE" as const,
      quantity: 100,
      qualifierScopes: [{ menuItemId: "latte-1", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p1", referencePriceVnd: 50_000 }],
      rewardMode: "ALLOWED_SCOPE" as const,
      rewardProductScopes: [{ menuItemId: "latte-2", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p2", referencePriceVnd: 55_000 }],
      maxApplications: 2,
    };
    const menuPrices = new Map([["latte-2", 55_000]]);
    expect(estimateVoucherLiabilityVnd(draft, menuPrices, new Map())).toBe(11_000_000);
    expect(estimateVoucherLiabilityVnd({ ...draft, quantity: null }, new Map(), new Map())).toBeNull();
  });

  it("FIXED_CONFIG báo lỗi khi Fusion chưa chọn size hoặc bột", () => {
    const draft = {
      ...createEmptyVoucherDraft(), voucherType: "BUNDLE" as const, name: "Quà Fusion",
      rewardMode: "FIXED_CONFIG" as const,
      qualifierScopes: [{ menuItemId: "latte", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p1", referencePriceVnd: 50_000 }],
      rewardProductScopes: [{ menuItemId: "fusion", category: "fusion" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: null, referencePriceVnd: 50_000 }],
    };
    expect(validateVoucherDraft(draft)).toContain("size");
    expect(validateVoucherDraft({ ...draft, rewardProductScopes: [{ ...draft.rewardProductScopes[0], sizes: ["MEDIUM"] }] })).toContain("bột");
  });

  it("review hiển thị size và bột riêng của từng món Fusion", () => {
    const draft = {
      ...createEmptyVoucherDraft(), voucherType: "BUNDLE" as const,
      qualifierScopes: [{ menuItemId: "latte", category: "latte" as const, sizes: ["MEDIUM", "LARGE"] as Array<"MEDIUM" | "LARGE">, powderIds: [], milkTypeIds: [], fixedPowderId: "p1", referencePriceVnd: 50_000 }],
      rewardMode: "FIXED_CONFIG" as const,
      rewardProductScopes: [{ menuItemId: "fusion", category: "fusion" as const, sizes: ["SMALL"] as Array<"SMALL">, powderIds: ["p2", "p3"], milkTypeIds: [], fixedPowderId: null, referencePriceVnd: 50_000 }],
    };
    const text = describeVoucherDraft(
      draft,
      new Map([["latte", "Latte"], ["fusion", "Fusion"]]),
      new Map(),
      new Map([["p2", "Hana"], ["p3", "Meyumi"]]),
      new Map(),
    );
    expect(text).toContain("Vừa + Lớn");
    expect(text).toContain("Hana + Meyumi");
  });

  it("gợi ý tên giảm phần trăm kèm giá trị đơn tối thiểu", () => {
    const draft = {
      ...createEmptyVoucherDraft(),
      discountValue: 15,
      minOrderVnd: 100_000,
    };

    expect(suggestVoucherCopy(draft, {
      menuLabels: new Map(), addonLabels: new Map(), powderLabels: new Map(), milkLabels: new Map(),
      defaultPowderByMenuId: new Map(), defaultMilkByMenuId: new Map(),
    })).toEqual({
      name: "Giảm 15% cho đơn từ 100k",
      description: "Giảm 15% cho đơn hàng từ 100.000đ.",
    });
  });

  it("gợi ý tên quà tặng từ món, size, bột và Base Liquid mà không thêm nhãn loại", () => {
    const draft = {
      ...createEmptyVoucherDraft(),
      voucherType: "PRODUCT" as const,
      menuItemId: "latte-1",
      size: "MEDIUM" as const,
      matchaPowderId: "powder-1",
      milkTypeId: "milk-1",
    };

    expect(suggestVoucherCopy(draft, {
      menuLabels: new Map([["latte-1", "Matcha Latte"]]),
      addonLabels: new Map(),
      powderLabels: new Map([["powder-1", "Hana"]]),
      milkLabels: new Map([["milk-1", "Oatside"]]),
      defaultPowderByMenuId: new Map(),
      defaultMilkByMenuId: new Map(),
    }).name).toBe("Free 1 ly Matcha Latte size Vừa Hana Oatside");
  });

  it("gợi ý bundle chỉ liệt kê tối đa hai món ở mỗi phía", () => {
    const baseDraft = {
      ...createEmptyVoucherDraft(),
      voucherType: "BUNDLE" as const,
      rewardMode: "ALLOWED_SCOPE" as const,
      qualifierScopes: [
        { menuItemId: "q1", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p1" },
        { menuItemId: "q2", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p2" },
      ],
      rewardProductScopes: [
        { menuItemId: "r1", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p3" },
        { menuItemId: "r2", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p4" },
      ],
    };
    const labels = {
      menuLabels: new Map([["q1", "Latte"], ["q2", "Fusion"], ["q3", "Trà"], ["r1", "Mochi"], ["r2", "Cookie"]]),
      addonLabels: new Map(), powderLabels: new Map(), milkLabels: new Map(),
      defaultPowderByMenuId: new Map(), defaultMilkByMenuId: new Map(),
    };

    expect(suggestVoucherCopy(baseDraft, labels).name).toBe("Mua 2 Latte, Fusion tặng 1 Mochi, Cookie");
    expect(suggestVoucherCopy({
      ...baseDraft,
      qualifierScopes: [...baseDraft.qualifierScopes, { menuItemId: "q3", category: "latte" as const, sizes: [], powderIds: [], milkTypeIds: [], fixedPowderId: "p5" }],
    }, labels).name).toBe("Mua 2 tặng 1 Mochi, Cookie");
  });
});
