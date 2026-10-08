import { describe, expect, it } from "vitest";
import type { VoucherPackage } from "@/contracts/voucher";
import { canExchange, filterModalPackages } from "@/src/lib/utils/voucherModalHelpers";

function packageFixture(overrides: Partial<VoucherPackage> = {}): VoucherPackage {
  return {
    id: "package-available",
    name: "Available package",
    description: null,
    voucher_type: "DISCOUNT",
    acquisition_mode: "POINTS_EXCHANGE",
    points_cost: 20,
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
    is_active: true,
    expires_after_days: 30,
    quantity: 10,
    max_per_user: 2,
    created_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("lọc catalog nhận và đổi voucher", () => {
  it("ẩn gói hết stock dù quantity ban đầu còn dương", () => {
    const soldOut = packageFixture({ remaining_quantity: 0, quantity: 10 });

    expect(filterModalPackages([soldOut])).toEqual([]);
  });

  it.each([0, 10])("giữ stock unlimited khi remaining_quantity null và quantity là %s", (quantity) => {
    const unlimited = packageFixture({ remaining_quantity: null, quantity });

    expect(filterModalPackages([unlimited]).map((pkg) => pkg.id)).toEqual(["package-available"]);
  });

  it("dùng quantity fallback khi remaining_quantity thiếu", () => {
    const packages = [
      packageFixture({ id: "legacy-empty", quantity: 0 }),
      packageFixture({ id: "legacy-stock", quantity: 1 }),
      packageFixture({ id: "legacy-unlimited", quantity: null }),
    ];

    expect(filterModalPackages(packages).map((pkg) => pkg.id)).toEqual([
      "legacy-stock",
      "legacy-unlimited",
    ]);
  });

  it("ẩn AUTO_GRANT và NONE khỏi catalog", () => {
    const packages = [
      packageFixture({ acquisition_mode: "AUTO_GRANT" }),
      // NONE is a documented excluded runtime mode, outside the customer DTO union.
      packageFixture({ acquisition_mode: "NONE" as VoucherPackage["acquisition_mode"] }),
    ];

    expect(filterModalPackages(packages)).toEqual([]);
  });

  it("ẩn gói chạm hoặc vượt quota và giữ gói còn lượt hoặc thiếu count", () => {
    const packages = [
      packageFixture({ id: "at-limit", user_redeemed_count: 2 }),
      packageFixture({ id: "over-limit", user_redeemed_count: 3 }),
      packageFixture({ id: "one-left", user_redeemed_count: 1 }),
      packageFixture({ id: "missing-count" }),
    ];

    expect(filterModalPackages(packages).map((pkg) => pkg.id)).toEqual(["one-left", "missing-count"]);
  });

  it("giữ cả FREE_CLAIM và POINTS_EXCHANGE cho đủ loại voucher", () => {
    const packages = [
      packageFixture({ id: "free-item", voucher_type: "ITEM", acquisition_mode: "FREE_CLAIM", points_cost: 0 }),
      packageFixture({ id: "points-product", voucher_type: "PRODUCT" }),
      packageFixture({ id: "points-product-discount", voucher_type: "PRODUCT_DISCOUNT" }),
      packageFixture({ id: "free-addon", voucher_type: "ADDON", acquisition_mode: "FREE_CLAIM", points_cost: 0 }),
      packageFixture({ id: "points-discount", voucher_type: "DISCOUNT" }),
      packageFixture({ id: "points-freeship", voucher_type: "FREESHIP" }),
      packageFixture({ id: "points-bundle", voucher_type: "BUNDLE" }),
    ];

    expect(filterModalPackages(packages).map((pkg) => pkg.id)).toEqual([
      "free-item", "points-product", "points-product-discount", "free-addon",
      "points-discount", "points-freeship", "points-bundle",
    ]);
  });

  it("vẫn giữ gói trong catalog khi khách thiếu điểm để đổi", () => {
    const expensive = packageFixture({ id: "expensive-package", points_cost: 100 });

    expect(filterModalPackages([expensive]).map((pkg) => pkg.id)).toEqual(["expensive-package"]);
    expect(canExchange(expensive, 0, 0)).toEqual({ ok: false, reason: "insufficient_points" });
  });
});

describe("kiểm tra điều kiện đổi voucher", () => {
  it("báo sold_out khi remaining_quantity bằng 0 dù quantity còn dương", () => {
    expect(canExchange(packageFixture({ remaining_quantity: 0, quantity: 10 }), 20, 0)).toEqual({
      ok: false, reason: "sold_out",
    });
  });

  it.each([0, 10])("cho phép đổi stock unlimited với quantity là %s", (quantity) => {
    expect(canExchange(packageFixture({ remaining_quantity: null, quantity }), 20, 0)).toEqual({ ok: true });
  });

  it("báo hết hàng theo quantity fallback khi remaining_quantity thiếu", () => {
    expect(canExchange(packageFixture({ quantity: 0 }), 20, 0)).toEqual({ ok: false, reason: "sold_out" });
  });

  it.each([1, null])("cho phép đổi theo quantity fallback còn hàng hoặc unlimited: %s", (quantity) => {
    expect(canExchange(packageFixture({ quantity }), 20, 0)).toEqual({ ok: true });
  });

  it.each([2, 3])("báo limit_reached khi đã nhận %s lượt với quota 2", (redeemedCount) => {
    expect(canExchange(packageFixture(), 20, redeemedCount)).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("cho phép đổi ở đúng số điểm yêu cầu và còn một lượt quota", () => {
    expect(canExchange(packageFixture({ remaining_quantity: 1 }), 20, 1)).toEqual({ ok: true });
  });

  it("ưu tiên thiếu điểm khi đồng thời hết stock và hết quota", () => {
    expect(canExchange(packageFixture({ remaining_quantity: 0 }), 19, 2)).toEqual({
      ok: false, reason: "insufficient_points",
    });
  });

  it("ưu tiên hết stock trước hết quota khi đã đủ điểm", () => {
    expect(canExchange(packageFixture({ remaining_quantity: 0 }), 20, 2)).toEqual({
      ok: false, reason: "sold_out",
    });
  });
});
