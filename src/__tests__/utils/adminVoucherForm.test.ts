import { describe, expect, it } from "vitest";
import {
  buildVoucherInput,
  createEmptyVoucherDraft,
  describeVoucherDraft,
  estimateVoucherLiabilityVnd,
  formatInclusiveEndDate,
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
    const draft = { ...createEmptyVoucherDraft(), name: "Mua 2 tặng 1", voucherType: "BUNDLE" as const, qualifierMenuItemIds: [] };
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
      qualifierMenuItemIds: ["latte-1", "latte-2"],
      rewardMenuItemIds: ["latte-3"],
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
      qualifierMenuItemIds: ["latte-1"],
      rewardMode: "ALLOWED_SCOPE" as const,
      rewardMenuItemIds: ["latte-2"],
      referencePriceVnd: 55_000,
      maxApplications: 2,
    };
    expect(estimateVoucherLiabilityVnd(draft, new Map(), new Map())).toBe(11_000_000);
    expect(estimateVoucherLiabilityVnd({ ...draft, quantity: null }, new Map(), new Map())).toBeNull();
  });
});
