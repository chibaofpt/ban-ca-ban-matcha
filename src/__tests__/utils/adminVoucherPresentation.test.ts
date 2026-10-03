import { describe, expect, it } from "vitest";

import { summarizeVoucherCapacity } from "@/src/lib/utils/adminVoucherPresentation";

describe("Trình bày sức chứa voucher package", () => {
  it("dùng quota issued cho tử số hữu hạn và total issued cho lượt sử dụng", () => {
    expect(summarizeVoucherCapacity({
      quantity: 5,
      stats: {
        issued_count: 13,
        quota_issued_count: 3,
        active_count: 9,
        reserved_count: 0,
        redeemed_count: 4,
        expired_count: 0,
        refunded_count: 0,
        remaining_quantity: 2,
      },
    })).toBe("Đã cấp 3/5 · Đã dùng 4/13");
  });
});
