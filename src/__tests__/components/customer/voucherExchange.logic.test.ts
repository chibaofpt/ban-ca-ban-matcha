/**
 * Tests for the logic of the Voucher Exchange screen (Quầy Đổi Thưởng).
 *
 * Tests pure functions that are extracted from the UI component so they
 * can be verified independently of React rendering:
 *
 *  - groupVoucherPackagesByType  → groups packages into DISCOUNT / PRODUCT / ADDON
 *  - canExchange                 → checks points_balance >= points_cost AND quantity > 0
 *  - formatExpiryLabel           → human-readable expiry string
 *  - getExchangeErrorMessage     → maps error codes → Vietnamese user messages
 */

import { describe, it, expect } from "vitest";

// ── Types ─────────────────────────────────────────────────────────────────────

type VoucherType = "DISCOUNT" | "PRODUCT" | "ADDON";

interface VoucherPackage {
  id: string;
  name: string;
  voucher_type: VoucherType;
  points_cost: number;
  is_active: boolean;
  expires_after_days: number | null;
  quantity: number | null;
  max_per_user: number;
  discount_type?: "PERCENT" | "FIXED" | null;
  discount_value?: number | null;
  menuItem?: { name: string; is_available: boolean } | null;
  addonOption?: { label: string } | null;
}

// ── Pure functions to be implemented in the actual component ──────────────────

function groupVoucherPackagesByType(packages: VoucherPackage[]): {
  DISCOUNT: VoucherPackage[];
  PRODUCT: VoucherPackage[];
  ADDON: VoucherPackage[];
} {
  return {
    DISCOUNT: packages.filter((p) => p.voucher_type === "DISCOUNT"),
    PRODUCT: packages.filter((p) => p.voucher_type === "PRODUCT"),
    ADDON: packages.filter((p) => p.voucher_type === "ADDON"),
  };
}

function canExchange(
  pkg: VoucherPackage,
  userBalance: number,
  userRedeemedCount: number
): { ok: boolean; reason?: string } {
  if (userBalance < pkg.points_cost) {
    return { ok: false, reason: "insufficient_points" };
  }
  if (pkg.quantity !== null && pkg.quantity <= 0) {
    return { ok: false, reason: "sold_out" };
  }
  if (userRedeemedCount >= pkg.max_per_user) {
    return { ok: false, reason: "limit_reached" };
  }
  return { ok: true };
}

function formatExpiryLabel(expires_after_days: number | null): string {
  if (expires_after_days === null) return "Vô thời hạn";
  if (expires_after_days === 1) return "1 ngày";
  return `${expires_after_days} ngày`;
}

function getExchangeErrorMessage(code: string, required?: number, available?: number): string {
  switch (code) {
    case "INSUFFICIENT_POINTS":
      return `Bạn không đủ điểm. Cần ${required} điểm, bạn đang có ${available} điểm.`;
    case "VOUCHER_LIMIT_REACHED":
      return "Bạn đã đổi đủ số lượng cho phép của gói này.";
    case "VOUCHER_SOLD_OUT":
      return "Gói voucher này đã hết. Hãy thử gói khác nhé!";
    case "NOT_FOUND":
      return "Gói voucher không còn khả dụng.";
    default:
      return "Đổi voucher thất bại. Vui lòng thử lại.";
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePackage(overrides: Partial<VoucherPackage> = {}): VoucherPackage {
  return {
    id: "pkg-1",
    name: "Giảm 10%",
    voucher_type: "DISCOUNT",
    points_cost: 50,
    is_active: true,
    expires_after_days: 30,
    quantity: 100,
    max_per_user: 1,
    ...overrides,
  };
}

// ── groupVoucherPackagesByType ─────────────────────────────────────────────────

describe("groupVoucherPackagesByType", () => {
  it("nhóm 3 loại voucher đúng vào các bucket tương ứng", () => {
    const packages: VoucherPackage[] = [
      makePackage({ id: "p1", voucher_type: "DISCOUNT" }),
      makePackage({ id: "p2", voucher_type: "PRODUCT" }),
      makePackage({ id: "p3", voucher_type: "ADDON" }),
      makePackage({ id: "p4", voucher_type: "DISCOUNT" }),
    ];

    const result = groupVoucherPackagesByType(packages);

    expect(result.DISCOUNT).toHaveLength(2);
    expect(result.PRODUCT).toHaveLength(1);
    expect(result.ADDON).toHaveLength(1);
    expect(result.DISCOUNT[0].id).toBe("p1");
    expect(result.DISCOUNT[1].id).toBe("p4");
  });

  it("trả về bucket rỗng khi không có gói thuộc loại đó", () => {
    const packages: VoucherPackage[] = [
      makePackage({ voucher_type: "DISCOUNT" }),
    ];

    const result = groupVoucherPackagesByType(packages);

    expect(result.PRODUCT).toHaveLength(0);
    expect(result.ADDON).toHaveLength(0);
  });

  it("mảng rỗng → 3 bucket đều rỗng", () => {
    const result = groupVoucherPackagesByType([]);

    expect(result.DISCOUNT).toHaveLength(0);
    expect(result.PRODUCT).toHaveLength(0);
    expect(result.ADDON).toHaveLength(0);
  });
});

// ── canExchange ────────────────────────────────────────────────────────────────

describe("canExchange", () => {
  it("ok = true khi đủ điểm, còn hàng, chưa đạt giới hạn", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 10, max_per_user: 2 });
    expect(canExchange(pkg, 100, 0)).toEqual({ ok: true });
  });

  it("ok = false + reason=insufficient_points khi không đủ điểm", () => {
    const pkg = makePackage({ points_cost: 100, quantity: 10, max_per_user: 1 });
    expect(canExchange(pkg, 50, 0)).toEqual({
      ok: false,
      reason: "insufficient_points",
    });
  });

  it("ok = false + reason=sold_out khi quantity = 0", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 0, max_per_user: 1 });
    expect(canExchange(pkg, 200, 0)).toEqual({
      ok: false,
      reason: "sold_out",
    });
  });

  it("ok = true khi quantity = null (vô hạn)", () => {
    const pkg = makePackage({ points_cost: 50, quantity: null, max_per_user: 1 });
    expect(canExchange(pkg, 200, 0)).toEqual({ ok: true });
  });

  it("ok = false + reason=limit_reached khi đã đổi đủ max_per_user", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 100, max_per_user: 1 });
    expect(canExchange(pkg, 200, 1)).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  it("kiểm tra thứ tự ưu tiên: điểm không đủ → ưu tiên hơn hết hàng", () => {
    const pkg = makePackage({ points_cost: 100, quantity: 0, max_per_user: 1 });
    // Không đủ điểm (20 < 100) — phải báo insufficient_points trước
    const result = canExchange(pkg, 20, 0);
    expect(result.reason).toBe("insufficient_points");
  });

  it("userRedeemedCount = max_per_user - 1 → vẫn còn lượt đổi", () => {
    const pkg = makePackage({ points_cost: 50, quantity: 100, max_per_user: 3 });
    expect(canExchange(pkg, 200, 2)).toEqual({ ok: true });
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

  it("7 → '7 ngày'", () => {
    expect(formatExpiryLabel(7)).toBe("7 ngày");
  });
});

// ── getExchangeErrorMessage ───────────────────────────────────────────────────

describe("getExchangeErrorMessage", () => {
  it("INSUFFICIENT_POINTS → thông báo kèm số điểm", () => {
    const msg = getExchangeErrorMessage("INSUFFICIENT_POINTS", 100, 20);
    expect(msg).toContain("100");
    expect(msg).toContain("20");
    expect(msg).toContain("điểm");
  });

  it("VOUCHER_LIMIT_REACHED → thông báo giới hạn", () => {
    const msg = getExchangeErrorMessage("VOUCHER_LIMIT_REACHED");
    expect(msg).toContain("đủ số lượng");
  });

  it("VOUCHER_SOLD_OUT → thông báo hết hàng", () => {
    const msg = getExchangeErrorMessage("VOUCHER_SOLD_OUT");
    expect(msg).toContain("hết");
  });

  it("NOT_FOUND → thông báo không khả dụng", () => {
    const msg = getExchangeErrorMessage("NOT_FOUND");
    expect(msg).toContain("không còn khả dụng");
  });

  it("mã lỗi không xác định → thông báo generic", () => {
    const msg = getExchangeErrorMessage("UNKNOWN_CODE");
    expect(msg).toContain("thử lại");
  });
});
