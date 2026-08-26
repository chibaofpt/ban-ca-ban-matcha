import { describe, expect, it } from "vitest";

import { getVoucherPackageStatus, summarizeVoucherBenefit, summarizeVoucherCapacity } from "@/src/lib/utils/adminVoucherPresentation";

describe("Trình bày package voucher quản trị", () => {
  const base = { is_active: true, ends_at: null, quantity: null, stats: { issued_count: 0, active_count: 0, reserved_count: 0, redeemed_count: 0, expired_count: 0, refunded_count: 0, remaining_quantity: null } };

  it("ưu tiên trạng thái kết thúc, hết lượt, tạm dừng rồi đang phát hành", () => {
    expect(getVoucherPackageStatus({ ...base, ends_at: "2026-01-01T00:00:00.000Z" }, new Date("2026-08-26"))).toBe("ENDED");
    expect(getVoucherPackageStatus({ ...base, quantity: 1, stats: { ...base.stats, issued_count: 1, remaining_quantity: 0 } })).toBe("SOLD_OUT");
    expect(getVoucherPackageStatus({ ...base, is_active: false })).toBe("PAUSED");
    expect(getVoucherPackageStatus(base)).toBe("ACTIVE");
  });

  it("hiển thị sức chứa không giới hạn và tránh tỷ lệ 0/0", () => {
    expect(summarizeVoucherCapacity(base)).toBe("Đã cấp 0 · Không giới hạn · Chưa có lượt sử dụng");
    expect(summarizeVoucherCapacity({ ...base, stats: { ...base.stats, issued_count: 4, redeemed_count: 2 } })).toBe("Đã cấp 4 · Không giới hạn · Đã dùng 2/4");
    expect(summarizeVoucherCapacity({ ...base, quantity: 10 })).toBe("Đã cấp 0/10 · Chưa có lượt sử dụng");
  });

  it("mô tả PRODUCT_DISCOUNT và FREESHIP", () => {
    expect(summarizeVoucherBenefit({ voucher_type: "PRODUCT_DISCOUNT", product_discount_mode: "FIXED_AMOUNT", discount_value: 25_000 })).toContain("25.000");
    expect(summarizeVoucherBenefit({ voucher_type: "FREESHIP", covered_delivery_fee_vnd: 20_000 })).toContain("20.000");
  });
});
