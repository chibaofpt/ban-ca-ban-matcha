import { describe, expect, it } from "vitest";

import {
  adminUserListQuerySchema,
  adminUserPatchSchema,
  adminUserPointsSchema,
  adminUserVoucherPackageQuerySchema,
} from "@/lib/validations/adminUser";

describe("validation quản lý khách hàng Admin", () => {
  it("chặn trang ngoài giới hạn và truy vấn dài hơn 50 ký tự", () => {
    expect(adminUserListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ page: "10001" }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ page: "1", q: "x".repeat(51) }).success).toBe(false);
  });

  it("chỉ nhận các mutation có payload đóng", () => {
    expect(adminUserPatchSchema.safeParse({ action: "verify", is_verified: true }).success).toBe(true);
    expect(adminUserPatchSchema.safeParse({ action: "block", is_blocked: true, extra: 1 }).success).toBe(false);
    expect(adminUserPatchSchema.safeParse({ action: "reset_password", is_blocked: false }).success).toBe(false);
    expect(adminUserPointsSchema.safeParse({ points: 100 }).success).toBe(true);
    expect(adminUserPointsSchema.safeParse({ points: 101 }).success).toBe(false);
  });

  it("chỉ nhận nhóm gói voucher đã duyệt", () => {
    expect(adminUserVoucherPackageQuerySchema.safeParse({ page: "1", category: "GIFT" }).success).toBe(true);
    expect(adminUserVoucherPackageQuerySchema.safeParse({ page: "1", category: "OTHER" }).success).toBe(false);
  });
});
