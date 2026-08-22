/**
 * Tests for pure logic functions of VoucherModal.
 *
 * All functions are tested independently of React rendering.
 * Functions will be implemented in src/lib/utils/voucherModalHelpers.ts
 */

import { describe, it, expect } from "vitest";
import {
  filterModalVouchers,
  filterHistoryVouchers,
  getAdjacentVoucherTab,
  canInteract,
  computePointsAfterExchange,
  getVoucherBenefitText,
  formatVoucherExpiry,
  canApplyOwnedVoucher,
  getVoucherAvailabilityMessage,
  getVoucherRefundConfirmation,
} from "@/src/lib/utils/voucherModalHelpers";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";
import { isVoucherUsable } from "@/src/utils/voucherMatchUtils";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeVoucher(overrides: Partial<MyVoucher> = {}): MyVoucher {
  return {
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
    created_at: new Date().toISOString(),
    package: { name: "Giảm 20%", description: null, points_cost: 50 },
    menuItem: null,
    addonOption: null,
    availability: {
      status: "USABLE",
      can_apply: true,
      can_refund: false,
      refund_points: 0,
    },
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
  it("chỉ trả về ACTIVE và RESERVED cho tab Voucher của tôi", () => {
    const vouchers = [
      makeVoucher({ qr_token: "v1", status: "ACTIVE" }),
      makeVoucher({ qr_token: "v2", status: "RESERVED" }),
      makeVoucher({ qr_token: "v3", status: "REDEEMED" }),
      makeVoucher({ qr_token: "v4", status: "EXPIRED" }),
      makeVoucher({ qr_token: "v5", status: "REFUNDED" }),
    ];
    const result = filterModalVouchers(vouchers);
    expect(result.map((v) => v.qr_token)).toEqual(["v1", "v2"]);
  });

  it("sắp xếp ACTIVE trước RESERVED", () => {
    const vouchers = [
      makeVoucher({ qr_token: "rd1", status: "REDEEMED" }),
      makeVoucher({ qr_token: "ex1", status: "EXPIRED" }),
      makeVoucher({ qr_token: "r1", status: "RESERVED" }),
      makeVoucher({ qr_token: "a1", status: "ACTIVE" }),
    ];
    const result = filterModalVouchers(vouchers);
    expect(result[0].status).toBe("ACTIVE");
    expect(result[1].status).toBe("RESERVED");
    expect(result).toHaveLength(2);
  });

  it("mảng rỗng → rỗng", () => {
    expect(filterModalVouchers([])).toHaveLength(0);
  });

  it("tất cả REDEEMED → trả về rỗng", () => {
    const vouchers = [
      makeVoucher({ status: "REDEEMED" }),
      makeVoucher({ status: "REDEEMED" }),
    ];
    expect(filterModalVouchers(vouchers)).toHaveLength(0);
  });
});
describe("filterHistoryVouchers", () => {
  it("chỉ trả về REDEEMED và EXPIRED, không trộn voucher còn hiệu lực", () => {
    const vouchers = [
      makeVoucher({ qr_token: "active", status: "ACTIVE" }),
      makeVoucher({ qr_token: "reserved", status: "RESERVED" }),
      makeVoucher({ qr_token: "redeemed", status: "REDEEMED" }),
      makeVoucher({ qr_token: "expired", status: "EXPIRED" }),
      makeVoucher({ qr_token: "refunded", status: "REFUNDED" }),
    ];

    expect(filterHistoryVouchers(vouchers).map((voucher) => voucher.qr_token)).toEqual([
      "redeemed",
      "expired",
    ]);
  });
});

describe("getAdjacentVoucherTab", () => {
  it("vuốt trái lần lượt qua Voucher của tôi → Đổi thưởng → Lịch sử", () => {
    expect(getAdjacentVoucherTab("my_vouchers", "left", true)).toBe("packages");
    expect(getAdjacentVoucherTab("packages", "left", true)).toBe("history");
  });

  it("vuốt phải quay ngược và dừng ở tab đầu", () => {
    expect(getAdjacentVoucherTab("history", "right", true)).toBe("packages");
    expect(getAdjacentVoucherTab("my_vouchers", "right", true)).toBe("my_vouchers");
  });

  it("khách chưa đăng nhập luôn ở tab Đổi thưởng", () => {
    expect(getAdjacentVoucherTab("packages", "left", false)).toBe("packages");
    expect(getAdjacentVoucherTab("packages", "right", false)).toBe("packages");
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
    const { filterModalPackages } = await import("@/src/lib/utils/voucherModalHelpers");
    const result = filterModalPackages(packages);
    
    expect(result).toHaveLength(2);
    expect(result.map((pkg) => pkg.id)).toEqual(["p1", "p3"]);
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
      size: "MEDIUM",
      menuItem: { name: "Trà Xanh Sữa", is_available: true },
    });
    const text = getVoucherBenefitText(v);
    expect(text).toContain("Trà Xanh Sữa");
    expect(text).toContain("MEDIUM");
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

  it("ITEM với menuItem → tên Add-on miễn phí", () => {
    const v = makeVoucher({
      voucher_type: "ITEM",
      menuItem: { name: "Kem vanilla", is_available: true },
    });
    expect(getVoucherBenefitText(v)).toBe("Kem vanilla miễn phí");
  });
});

describe("availability voucher", () => {
  it("khóa áp voucher khi backend đánh dấu không còn qualifier", () => {
    const voucher = makeVoucher({
      availability: {
        status: "NO_ACTIVE_QUALIFIER",
        can_apply: false,
        can_refund: true,
        refund_points: 80,
      },
    });

    expect(canApplyOwnedVoucher(voucher)).toBe(false);
    expect(getVoucherAvailabilityMessage(voucher)).toBe(
      "Các món mua kèm hiện đang ngưng phục vụ.",
    );
  });

  it("không đưa voucher backend đánh dấu unusable vào picker", () => {
    const voucher = makeVoucher({
      availability: {
        status: "TARGET_UNAVAILABLE",
        can_apply: false,
        can_refund: true,
        refund_points: 50,
      },
    });

    expect(isVoucherUsable(voucher)).toBe(false);
  });

  it("hiển thị đúng lý do khi quà tặng không còn phục vụ", () => {
    const voucher = makeVoucher({
      availability: {
        status: "NO_ACTIVE_REWARD",
        can_apply: false,
        can_refund: false,
        refund_points: 0,
      },
    });

    expect(getVoucherAvailabilityMessage(voucher)).toBe(
      "Quà tặng hiện không còn phục vụ.",
    );
  });

  it("nội dung hoàn điểm ghi rõ không thể hoàn tác và không khôi phục lượt đổi", () => {
    expect(getVoucherRefundConfirmation(80)).toContain("80 điểm");
    expect(getVoucherRefundConfirmation(80)).toContain("không thể sử dụng lại");
    expect(getVoucherRefundConfirmation(80)).toContain("không được khôi phục");
  });
});
