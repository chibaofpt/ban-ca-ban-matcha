import { describe, expect, it } from "vitest";
import { getAdminRewardPoolFeedback, isAdminRewardPackageAvailable } from "@/src/utils/adminRewardPool";

describe("phản hồi cấu hình pool phần thưởng", () => {
  it("tính tổng và chấp nhận threshold có đủ lượt mở trước đó", () => {
    expect(getAdminRewardPoolFeedback([
      { voucher_package_id: "a", quantity: 5, unlock_after_draws: 0 },
      { voucher_package_id: "b", quantity: 2, unlock_after_draws: 5 },
    ])).toEqual({ total: 7, warning: null });
  });

  it("cảnh báo threshold không thể đạt", () => {
    expect(getAdminRewardPoolFeedback([
      { voucher_package_id: "a", quantity: 2, unlock_after_draws: 0 },
      { voucher_package_id: "b", quantity: 4, unlock_after_draws: 3 },
    ])).toEqual({ total: 6, warning: "Mốc mở 3 cần ít nhất 3 phần quà khả dụng trước đó." });
  });

  it("chỉ xem package active và chưa hết hạn là khả dụng", () => {
    const now = new Date("2026-09-13T00:00:00.000Z");
    expect(isAdminRewardPackageAvailable({ is_active: true, ends_at: "2026-09-14T00:00:00.000Z" }, now)).toBe(true);
    expect(isAdminRewardPackageAvailable({ is_active: false, ends_at: null }, now)).toBe(false);
    expect(isAdminRewardPackageAvailable({ is_active: true, ends_at: "2026-09-13T00:00:00.000Z" }, now)).toBe(false);
  });

  it.each([
    { label: "pool rỗng", items: [], expected: "Pool cần ít nhất một voucher." },
    { label: "trùng package", items: [{ voucher_package_id: "a", quantity: 1, unlock_after_draws: 0 }, { voucher_package_id: "a", quantity: 1, unlock_after_draws: 0 }], expected: "Mỗi voucher chỉ được xuất hiện một lần." },
    { label: "quantity không nguyên", items: [{ voucher_package_id: "a", quantity: 1.5, unlock_after_draws: 0 }], expected: "Số lượng mỗi voucher phải là số nguyên từ 1 đến 10.000." },
    { label: "quantity quá lớn", items: [{ voucher_package_id: "a", quantity: 10001, unlock_after_draws: 0 }], expected: "Số lượng mỗi voucher phải là số nguyên từ 1 đến 10.000." },
    { label: "unlock ngoài miền", items: [{ voucher_package_id: "a", quantity: 2, unlock_after_draws: 100000 }], expected: "Mốc mở phải là số nguyên từ 0 đến 99.999." },
    { label: "unlock bằng total", items: [{ voucher_package_id: "a", quantity: 2, unlock_after_draws: 2 }], expected: "Mốc mở phải nhỏ hơn tổng phân bổ 2." },
  ])("cảnh báo structural bound: $label", ({ items, expected }) => {
    expect(getAdminRewardPoolFeedback(items).warning).toBe(expected);
  });

  it("giới hạn tối đa 100 dòng và tổng 100.000", () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => ({ voucher_package_id: `p${index}`, quantity: 1, unlock_after_draws: 0 }));
    expect(getAdminRewardPoolFeedback(tooMany).warning).toBe("Pool có tối đa 100 voucher.");
    const tooLarge = Array.from({ length: 11 }, (_, index) => ({ voucher_package_id: `p${index}`, quantity: 10000, unlock_after_draws: 0 }));
    expect(getAdminRewardPoolFeedback(tooLarge).warning).toBe("Tổng phân bổ không được vượt 100.000.");
  });
});
