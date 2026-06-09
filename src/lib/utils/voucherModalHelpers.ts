/**
 * voucherModalHelpers — Pure functions for VoucherModal logic.
 *
 * Extracted from RewardsPage.tsx and MyVouchersPage.tsx so they can be
 * tested independently and shared across the unified VoucherModal.
 */

import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";

// ── Section 1: My Vouchers ────────────────────────────────────────────────────

/**
 * Filter vouchers to show in Section 1 of VoucherModal.
 * Shows only ACTIVE + RESERVED; hides REDEEMED/EXPIRED/REFUNDED.
 * ACTIVE vouchers are sorted before RESERVED.
 */
export function filterModalVouchers(vouchers: MyVoucher[]): MyVoucher[] {
  return vouchers
    .filter((v) => v.status === "ACTIVE" || v.status === "RESERVED")
    .sort((a, b) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
      return 0;
    });
}

/**
 * Returns true if the voucher allows user interaction (QR display, etc).
 * Only ACTIVE vouchers are interactive.
 */
export function canInteract(voucher: MyVoucher): boolean {
  return voucher.status === "ACTIVE";
}

// ── Section 2: Exchange Packages ─────────────────────────────────────────────

/**
 * Filter packages to hide those that the user has already maxed out.
 */
export function filterModalPackages(packages: VoucherPackage[]): VoucherPackage[] {
  return packages.filter(
    (pkg) => pkg.user_redeemed_count === undefined || pkg.user_redeemed_count < pkg.max_per_user
  );
}

/**
 * Checks whether a user can exchange a package.
 * Priority: points check → sold_out → limit_reached.
 */
export function canExchange(
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

/**
 * Maps API error codes from POST /api/profile/vouchers/exchange to
 * Vietnamese user-facing messages.
 */
export function getExchangeErrorMessage(
  code: string,
  required?: number,
  available?: number
): string {
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

/**
 * Group packages by their voucher_type.
 */
export function groupPackagesByType(packages: VoucherPackage[]): {
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

// ── Points ────────────────────────────────────────────────────────────────────

/**
 * Computes the points balance after an exchange. Never goes below 0.
 */
export function computePointsAfterExchange(balance: number, cost: number): number {
  return Math.max(0, balance - cost);
}

// ── Display Helpers ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable expiry label for a VoucherPackage
 * based on expires_after_days.
 */
export function formatExpiryLabel(expiresAfterDays: number | null): string {
  if (expiresAfterDays === null) return "Vô thời hạn";
  if (expiresAfterDays === 1) return "1 ngày";
  return `${expiresAfterDays} ngày`;
}

/**
 * Returns a human-readable expiry string for a Voucher instance
 * based on its expires_at ISO timestamp.
 */
export function formatVoucherExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Vô thời hạn";
  const d = new Date(expiresAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Đã hết hạn";
  if (diffDays === 1) return "Hết hạn hôm nay";
  if (diffDays <= 7) return `Còn ${diffDays} ngày`;
  return `HSD: ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * Returns a short benefit description for a MyVoucher instance.
 * Used in Section 1 (My Vouchers) cards and QR modal.
 */
export function getVoucherBenefitText(v: MyVoucher): string {
  if (v.voucher_type === "DISCOUNT") {
    if (v.discount_type === "PERCENT") return `Giảm ${v.discount_value}% toàn đơn`;
    if (v.discount_type === "FIXED")
      return `Giảm ${(v.discount_value ?? 0).toLocaleString("vi-VN")}đ toàn đơn`;
  }
  if (v.voucher_type === "PRODUCT") {
    const itemName = v.menuItem?.name ?? "Sản phẩm";
    return `${itemName}${v.size ? ` Size ${v.size}` : ""} miễn phí`;
  }
  if (v.voucher_type === "ADDON") {
    return `Topping ${v.addonOption?.label ?? "Addon"} miễn phí`;
  }
  if (v.voucher_type === "FREESHIP") {
    return `Freeship tối đa ${(v.covered_delivery_fee_vnd ?? 0).toLocaleString("vi-VN")}đ`;
  }
  return v.package.name;
}

/**
 * Returns a short benefit description for a VoucherPackage.
 * Used in Section 2 (Exchange) cards.
 */
export function getPackageBenefitText(pkg: VoucherPackage): string {
  if (pkg.voucher_type === "DISCOUNT") {
    if (pkg.discount_type === "PERCENT") return `Giảm ${pkg.discount_value}% toàn đơn`;
    if (pkg.discount_type === "FIXED")
      return `Giảm ${(pkg.discount_value ?? 0).toLocaleString("vi-VN")}đ toàn đơn`;
  }
  if (pkg.voucher_type === "PRODUCT" && pkg.menuItem) {
    return `${pkg.menuItem.name} Size ${pkg.size} miễn phí`;
  }
  if (pkg.voucher_type === "ADDON" && pkg.addonOption) {
    return `Topping ${pkg.addonOption.label} miễn phí`;
  }
  return pkg.description ?? "Ưu đãi đặc biệt";
}

/** Badge config for voucher types */
export const VOUCHER_TYPE_CONFIG: Record<
  "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP",
  { label: string; badgeCls: string }
> = {
  DISCOUNT: { label: "Giảm giá", badgeCls: "bg-blue-100 text-blue-800" },
  PRODUCT: { label: "Sản phẩm", badgeCls: "bg-green-100 text-green-800" },
  ADDON: { label: "Topping", badgeCls: "bg-purple-100 text-purple-800" },
  FREESHIP: { label: "Freeship", badgeCls: "bg-orange-100 text-orange-800" },
};
