import { describe, expect, it } from "vitest";
import {
  canExchange,
  formatExpiryLabel,
  getExchangeErrorMessage,
  getPackageBenefitText,
  groupPackagesByType,
} from "@/src/lib/utils/voucherModalHelpers";
import type { VoucherPackage } from "@/src/services/customerVoucherService";

function makePackage(overrides: Partial<VoucherPackage> = {}): VoucherPackage {
  return {
    id: "pkg-1", name: "Ưu đãi", description: null, voucher_type: "DISCOUNT",
    acquisition_mode: "POINTS_EXCHANGE", points_cost: 50, discount_type: "PERCENT",
    discount_value: 10, menu_item_id: null, size: null, matcha_powder_id: null,
    milk_type_id: null, included_addon_option_ids: [], addon_option_id: null,
    covered_price_vnd: null, covered_delivery_fee_vnd: null, min_order_vnd: null,
    is_active: true, expires_after_days: 30, quantity: 100, max_per_user: 1,
    created_at: new Date().toISOString(), ...overrides,
  };
}

describe("Logic hiển thị và nhận gói voucher", () => {
  it("ưu tiên remaining_quantity để nhận diện gói đã phát hết", () => {
    const pkg = makePackage({ quantity: 100, remaining_quantity: 0 });
    expect(canExchange(pkg, 200, 0)).toEqual({ ok: false, reason: "sold_out" });
  });

  it("mô tả BUNDLE gồm số lượng và tên nhóm món", () => {
    const pkg = makePackage({ voucher_type: "BUNDLE", bundleRule: {
      buy_quantity: 2, reward_quantity: 1, reward_kind: "PRODUCT",
      reward_mode: "ALLOWED_SCOPE", benefit_scaling: "PER_BUNDLE",
      max_applications_order: 1, max_reward_units_order: null,
      productScopes: [
        {
          role: "QUALIFIER", menu_item_id: "latte", size: null,
          matcha_powder_id: null, milk_type_id: null, reference_price_vnd: null,
          menuItem: { name: "Latte", category: "latte", is_available: true },
        },
        {
          role: "REWARD", menu_item_id: "fusion", size: null,
          matcha_powder_id: null, milk_type_id: null, reference_price_vnd: null,
          menuItem: { name: "Fusion", category: "fusion", is_available: true },
        },
      ], addonRewards: [],
    } });
    expect(getPackageBenefitText(pkg)).toBe("Mua 2 Latte · Tặng 1 Fusion");
  });

  it("chặn đổi khi không đủ điểm, hết quota hoặc hết lượt cá nhân", () => {
    expect(canExchange(makePackage({ points_cost: 100 }), 50, 0).reason).toBe("insufficient_points");
    expect(canExchange(makePackage({ quantity: 0 }), 200, 0).reason).toBe("sold_out");
    expect(canExchange(makePackage({ max_per_user: 1 }), 200, 1).reason).toBe("limit_reached");
  });

  it("format hạn dùng và thông báo lỗi đổi điểm", () => {
    expect(formatExpiryLabel(null)).toBe("Vô thời hạn");
    expect(formatExpiryLabel(1)).toBe("1 ngày");
    expect(getExchangeErrorMessage("INSUFFICIENT_POINTS", 100, 20)).toContain("100");
    expect(getExchangeErrorMessage("VOUCHER_SOLD_OUT")).toContain("hết");
  });

  it("nhóm package theo loại voucher", () => {
    const grouped = groupPackagesByType([
      makePackage({ voucher_type: "DISCOUNT" }),
      makePackage({ voucher_type: "PRODUCT" }),
      makePackage({ voucher_type: "ADDON" }),
    ]);
    expect(grouped.DISCOUNT).toHaveLength(1);
    expect(grouped.PRODUCT).toHaveLength(1);
    expect(grouped.ADDON).toHaveLength(1);
  });
});
