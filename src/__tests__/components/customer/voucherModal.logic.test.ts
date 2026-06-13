/**
 * Tests for pure logic functions of VoucherModal.
 *
 * All functions are tested independently of React rendering.
 * Functions will be implemented in src/lib/utils/voucherModalHelpers.ts
 */

import { describe, it, expect } from "vitest";
import {
  filterModalVouchers,
  canInteract,
  computePointsAfterExchange,
  getVoucherBenefitText,
  canExchange,
  getExchangeErrorMessage,
  formatExpiryLabel,
  formatVoucherExpiry,
  groupPackagesByType,
} from "@/src/lib/utils/voucherModalHelpers";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVoucher(overrides: Partial<MyVoucher> = {}): MyVoucher {
  return {
    id: "v-1",
    qr_token: "QR-TOKEN-ABC",
    voucher_type: "DISCOUNT",
    discount_type: "PERCENT",
    discount_value: 20,
    menu_item_id: null,
    size: null,
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: null,
    covered_delivery_fee_vnd: null,
    status: "ACTIVE",
    used_channel: null,
    expires_at: null,
    redeemed_at: null,
    redeemed_by: null,
    created_at: new Date().toISOString(),
    package: { name: "Giảm 20%", description: null, points_cost: 50 },
    menuItem: null,
    addonOption: null,
    ...overrides,
  } as MyVoucher;
}

function makePackage(overrides: Partial<VoucherPackage> = {}): VoucherPackage {
  return {
    id: "pkg-1",
    name: "Giảm 10%",
    description: null,
    voucher_type: "DISCOUNT",
    points_cost: 50,
    discount_type: "PERCENT",
    discount_value: 10,
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
    quantity: 100,
    max_per_user: 1,
    created_at: new Date().toISOString(),
    menuItem: null,
    addonOption: null,
    ...overrides,
  } as VoucherPackage;
}

// ── filterModalVouchers ────────────────────────────────────────────────────────

describe("filterModalVouchers", () => {
  it("chỉ trả ACTIVE + RESERVED, ẩn REDEEMED/EXPIRED/REFUNDED", () => {
    const vouchers = [
      makeVoucher({ id: "v1", status: "ACTIVE" }),
      makeVoucher({ id: "v2", status: "RESERVED" }),
      makeVoucher({ id: "v3", status: "REDEEMED" }),
      makeVoucher({ id: "v4", status: "EXPIRED" }),
      makeVoucher({ id: "v5", status: "REFUNDED" }),
    ];
    const result = filterModalVouchers(vouchers);
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toEqual(expect.arrayContaining(["v1", "v2"]));
    expect(result.map((v) => v.id)).not.toContain("v3");
    expect(result.map((v) => v.id)).not.toContain("v4");
    expect(result.map((v) => v.id)).not.toContain("v5");
  });

  it("sắp xếp ACTIVE trước, RESERVED sau", () => {
    const vouchers = [
      makeVoucher({ id: "r1", status: "RESERVED" }),
      makeVoucher({ id: "a1", status: "ACTIVE" }),
      makeVoucher({ id: "r2", status: "RESERVED" }),
      makeVoucher({ id: "a2", status: "ACTIVE" }),
    ];
    const result = filterModalVouchers(vouchers);
    expect(result[0].status).toBe("ACTIVE");
    expect(result[1].status).toBe("ACTIVE");
    expect(result[2].status).toBe("RESERVED");
    expect(result[3].status).toBe("RESERVED");
  });

  it("mảng rỗng → rỗng", () => {
    expect(filterModalVouchers([])).toHaveLength(0);
  });

  it("tất cả REDEEMED → rỗng", () => {
    const vouchers = [
      makeVoucher({ status: "REDEEMED" }),
      makeVoucher({ status: "REDEEMED" }),
    ];
    expect(filterModalVouchers(vouchers)).toHaveLength(0);
  });
});

// ── filterModalPackages ────────────────────────────────────────────────────────

describe("filterModalPackages", () => {
  it("loại bỏ các package đã hết lượt đổi (user_redeemed_count >= max_per_user)", async () => {
    const packages = [
      makePackage({ id: "p1", max_per_user: 1, user_redeemed_count: 0 }),
      makePackage({ id: "p2", max_per_user: 2, user_redeemed_count: 2 }), // maxed out
      makePackage({ id: "p3", max_per_user: 1, user_redeemed_count: undefined }), // backward compatibility
    ];
    // @ts-ignore
    const { filterModalPackages } = await import("@/src/lib/utils/voucherModalHelpers");
    const result = filterModalPackages(packages);
    
    expect(result).toHaveLength(2);
    expect(result.map((p: any) => p.id)).toEqual(["p1", "p3"]);
  });
});

// ── canInteract ────────────────────────────────────────────────────────────────

describe("canInteract", () => {
  it("ACTIVE → true", () => {
    expect(canInteract(makeVoucher({ status: "ACTIVE" }))).toBe(true);
  });

  it("RESERVED → false (đang gắn với đơn hàng)", () => {
    expect(canInteract(makeVoucher({ status: "RESERVED" }))).toBe(false);
  });

  it("EXPIRED → false", () => {
    expect(canInteract(makeVoucher({ status: "EXPIRED" }))).toBe(false);
  });

  it("REDEEMED → false", () => {
    expect(canInteract(makeVoucher({ status: "REDEEMED" }))).toBe(false);
  });
});

// ── computePointsAfterExchange ────────────────────────────────────────────────

describe("computePointsAfterExchange", () => {
  it("150 - 50 = 100", () => {
    expect(computePointsAfterExchange(150, 50)).toBe(100);
  });

  it("50 - 50 = 0", () => {
    expect(computePointsAfterExchange(50, 50)).toBe(0);
  });

  it("không cho âm: 30 - 50 → 0", () => {
    expect(computePointsAfterExchange(30, 50)).toBe(0);
  });

  it("0 - 0 = 0", () => {
    expect(computePointsAfterExchange(0, 0)).toBe(0);
  });
});

// ── getVoucherBenefitText ─────────────────────────────────────────────────────

describe("getVoucherBenefitText", () => {
  it("DISCOUNT PERCENT → 'Giảm X% toàn đơn'", () => {
    const v = makeVoucher({ voucher_type: "DISCOUNT", discount_type: "PERCENT", discount_value: 20 });
    expect(getVoucherBenefitText(v)).toBe("Giảm 20% toàn đơn");
  });

  it("DISCOUNT FIXED → 'Giảm Xđ toàn đơn'", () => {
    const v = makeVoucher({ voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 10000 });
    const text = getVoucherBenefitText(v);
    expect(text).toContain("Giảm");
    expect(text).toContain("toàn đơn");
  });

  it("PRODUCT với menuItem → tên sản phẩm + size", () => {
    const v = makeVoucher({
      voucher_type: "PRODUCT",
      size: "L",
      menuItem: { name: "Trà Xanh Sữa", is_available: true },
    });
    const text = getVoucherBenefitText(v);
    expect(text).toContain("Trà Xanh Sữa");
    expect(text).toContain("L");
    expect(text).toContain("miễn phí");
  });

  it("ADDON với addonOption → tên topping", () => {
    const v = makeVoucher({
      voucher_type: "ADDON",
      addonOption: { label: "Kem Cheese" },
    });
    const text = getVoucherBenefitText(v);
    expect(text).toContain("Kem Cheese");
    expect(text).toContain("miễn phí");
  });

  it("FREESHIP → có chứa thông tin phí ship", () => {
    const v = makeVoucher({
      voucher_type: "FREESHIP",
      covered_delivery_fee_vnd: 30000,
    });
    const text = getVoucherBenefitText(v);
    expect(text.toLowerCase()).toContain("freeship");
  });
});

// ── canExchange ────────────────────────────────────────────────────────────────

describe("canExchange", () => {
  it("ok = true khi đủ điểm, còn hàng, chưa limit", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 10, max_per_user: 2 });
    expect(canExchange(pkg, 100, 0)).toEqual({ ok: true });
  });

  it("ok = false + insufficient_points khi không đủ điểm", () => {
    const pkg = makePackage({ points_cost: 100, quantity: 10, max_per_user: 1 });
    expect(canExchange(pkg, 50, 0)).toEqual({ ok: false, reason: "insufficient_points" });
  });

  it("ok = false + sold_out khi quantity = 0", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 0, max_per_user: 1 });
    expect(canExchange(pkg, 200, 0)).toEqual({ ok: false, reason: "sold_out" });
  });

  it("ok = true khi quantity = null (vô hạn)", () => {
    const pkg = makePackage({ points_cost: 50, quantity: null, max_per_user: 1 });
    expect(canExchange(pkg, 200, 0)).toEqual({ ok: true });
  });

  it("ok = false + limit_reached khi đã đổi đủ max_per_user", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 100, max_per_user: 1 });
    expect(canExchange(pkg, 200, 1)).toEqual({ ok: false, reason: "limit_reached" });
  });
});

// ── getExchangeErrorMessage ───────────────────────────────────────────────────

describe("getExchangeErrorMessage", () => {
  it("INSUFFICIENT_POINTS → có chứa số điểm", () => {
    const msg = getExchangeErrorMessage("INSUFFICIENT_POINTS", 100, 20);
    expect(msg).toContain("100");
    expect(msg).toContain("20");
  });

  it("VOUCHER_LIMIT_REACHED → chứa 'đủ số lượng'", () => {
    expect(getExchangeErrorMessage("VOUCHER_LIMIT_REACHED")).toContain("đủ số lượng");
  });

  it("VOUCHER_SOLD_OUT → chứa 'hết'", () => {
    expect(getExchangeErrorMessage("VOUCHER_SOLD_OUT")).toContain("hết");
  });

  it("NOT_FOUND → chứa 'không còn'", () => {
    expect(getExchangeErrorMessage("NOT_FOUND")).toContain("không còn");
  });

  it("mã lỗi không xác định → chứa 'thử lại'", () => {
    expect(getExchangeErrorMessage("UNKNOWN_CODE")).toContain("thử lại");
  });
});

// ── formatExpiryLabel ─────────────────────────────────────────────────────────

describe("formatExpiryLabel", () => {
  it("null → 'Vô thời hạn'", () => {
    expect(formatExpiryLabel(null)).toBe("Vô thời hạn");
  });

  it("1 → '1 ngày'", () => {
    expect(formatExpiryLabel(1)).toBe("1 ngày");
  });

  it("30 → '30 ngày'", () => {
    expect(formatExpiryLabel(30)).toBe("30 ngày");
  });
});

// ── formatVoucherExpiry ───────────────────────────────────────────────────────

describe("formatVoucherExpiry", () => {
  it("null → 'Vô thời hạn'", () => {
    expect(formatVoucherExpiry(null)).toBe("Vô thời hạn");
  });

  it("ngày trong tương lai xa → dạng HSD dd/mm/yyyy", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatVoucherExpiry(future);
    expect(result).toContain("HSD");
  });

  it("ngày trong 7 ngày tới → dạng 'Còn X ngày'", () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatVoucherExpiry(soon);
    expect(result).toContain("Còn");
    expect(result).toContain("ngày");
  });

  it("ngày đã qua → 'Đã hết hạn'", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(formatVoucherExpiry(past)).toBe("Đã hết hạn");
  });
});

// ── groupPackagesByType ───────────────────────────────────────────────────────

describe("groupPackagesByType", () => {
  it("nhóm đúng 3 loại DISCOUNT/PRODUCT/ADDON", () => {
    const packages = [
      makePackage({ id: "p1", voucher_type: "DISCOUNT" }),
      makePackage({ id: "p2", voucher_type: "PRODUCT" }),
      makePackage({ id: "p3", voucher_type: "ADDON" }),
      makePackage({ id: "p4", voucher_type: "DISCOUNT" }),
    ];
    const result = groupPackagesByType(packages);
    expect(result.DISCOUNT).toHaveLength(2);
    expect(result.PRODUCT).toHaveLength(1);
    expect(result.ADDON).toHaveLength(1);
  });

  it("bucket rỗng khi không có gói thuộc loại đó", () => {
    const packages = [makePackage({ voucher_type: "DISCOUNT" })];
    const result = groupPackagesByType(packages);
    expect(result.PRODUCT).toHaveLength(0);
    expect(result.ADDON).toHaveLength(0);
  });

  it("mảng rỗng → 3 bucket đều rỗng", () => {
    const result = groupPackagesByType([]);
    expect(result.DISCOUNT).toHaveLength(0);
    expect(result.PRODUCT).toHaveLength(0);
    expect(result.ADDON).toHaveLength(0);
  });
});
