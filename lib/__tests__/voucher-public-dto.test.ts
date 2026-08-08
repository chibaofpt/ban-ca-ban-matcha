import { describe, expect, it } from "vitest";
import { toPublicVoucherDto } from "@/lib/voucherPublicDto";

describe("Voucher public DTO", () => {
  it("chỉ xuất qr_token và bỏ toàn bộ internal identity", () => {
    const dto = toPublicVoucherDto({
      id: "internal-voucher-id",
      user_id: "internal-user-id",
      package_id: "internal-package-id",
      qr_token: "public-voucher-token",
      voucher_type: "DISCOUNT",
      discount_type: "FIXED",
      discount_value: 10_000,
      menu_item_id: null,
      size: null,
      matcha_powder_id: null,
      milk_type_id: null,
      included_addon_option_ids: [],
      addon_option_id: null,
      covered_price_vnd: null,
      covered_delivery_fee_vnd: null,
      min_order_vnd: null,
      status: "ACTIVE",
      used_channel: null,
      expires_at: null,
      redeemed_at: null,
      redeemed_by: "internal-staff-id",
      created_at: new Date("2026-01-01T00:00:00Z"),
      package: { name: "Giảm 10k", description: null, points_cost: 10 },
      menuItem: null,
      addonOption: null,
      staff: { name: "Nhân viên", role: "STAFF" },
    });

    expect(dto.qr_token).toBe("public-voucher-token");
    expect(dto).not.toHaveProperty("id");
    expect(dto).not.toHaveProperty("user_id");
    expect(dto).not.toHaveProperty("package_id");
    expect(dto).not.toHaveProperty("redeemed_by");
  });
});
