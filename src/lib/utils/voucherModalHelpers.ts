/**
 * voucherModalHelpers — Pure functions for VoucherModal logic.
 *
 * Extracted from RewardsPage.tsx and MyVouchersPage.tsx so they can be
 * tested independently and shared across the unified VoucherModal.
 */

import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";

// ── Section 1: My Vouchers ────────────────────────────────────────────────────

/**
 * Filter usable and reserved vouchers for the "Voucher của tôi" tab.
 * Sort order: ACTIVE before RESERVED.
 */
export function filterModalVouchers(vouchers: MyVoucher[]): MyVoucher[] {
  const getWeight = (status: string) => {
    if (status === "ACTIVE") return 2;
    if (status === "RESERVED") return 1;
    return 0;
  };
  return vouchers
    .filter((v) => getWeight(v.status) > 0)
    .sort((a, b) => getWeight(b.status) - getWeight(a.status));
}

/** Filter redeemed and expired vouchers for the history tab. */
export function filterHistoryVouchers(vouchers: MyVoucher[]): MyVoucher[] {
  return vouchers.filter(
    (voucher) => voucher.status === "REDEEMED" || voucher.status === "EXPIRED",
  );
}

export type VoucherModalTab = "my_vouchers" | "packages" | "history";

/** Resolve the next voucher tab for a horizontal swipe without wrapping. */
export function getAdjacentVoucherTab(
  activeTab: VoucherModalTab,
  direction: "left" | "right",
  isLoggedIn: boolean,
): VoucherModalTab {
  if (!isLoggedIn) return "packages";
  const tabs: VoucherModalTab[] = ["my_vouchers", "packages", "history"];
  const currentIndex = tabs.indexOf(activeTab);
  const offset = direction === "left" ? 1 : -1;
  const nextIndex = Math.min(tabs.length - 1, Math.max(0, currentIndex + offset));
  return tabs[nextIndex];
}

/**
 * Returns true if the voucher allows user interaction (QR display, etc).
 * Only ACTIVE vouchers are interactive.
 */
export function canInteract(voucher: MyVoucher): boolean {
  return voucher.status === "ACTIVE";
}

/** Return whether the owned voucher can enter its apply flow according to live backend data. */
export function canApplyOwnedVoucher(voucher: MyVoucher): boolean {
  return voucher.status === "ACTIVE" && voucher.availability.can_apply;
}

/** Map server-owned availability state to a concise Vietnamese explanation. */
export function getVoucherAvailabilityMessage(voucher: MyVoucher): string | null {
  if (voucher.availability.status === "USABLE") return null;
  switch (voucher.availability.status) {
    case "TARGET_UNAVAILABLE":
      return "Món áp dụng voucher hiện đang ngưng phục vụ.";
    case "NO_ACTIVE_QUALIFIER":
      return "Các món mua kèm hiện đang ngưng phục vụ.";
    case "NO_ACTIVE_REWARD":
      return "Quà tặng hiện không còn phục vụ.";
    case "NO_ACTIVE_CONFIGURATION":
      return "Món hiện không còn cấu hình bột hoặc sữa phù hợp.";
  }
}

/** Build the canonical irreversible refund confirmation copy. */
export function getVoucherRefundConfirmation(points: number): string {
  return `Bạn sẽ nhận lại ${points.toLocaleString("vi-VN")} điểm. Voucher này sẽ bị huỷ và không thể sử dụng lại. Lượt đổi của gói này không được khôi phục.`;
}

// ── Section 2: Exchange Packages ─────────────────────────────────────────────

/**
 * Filter packages to hide those that the user has already maxed out.
 */
export function filterModalPackages(packages: VoucherPackage[]): VoucherPackage[] {
  return packages.filter(
    (pkg) =>
      pkg.acquisition_mode !== "AUTO_GRANT" &&
      (pkg.user_redeemed_count === undefined || pkg.user_redeemed_count < pkg.max_per_user)
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
  const remainingQuantity = pkg.remaining_quantity ?? pkg.quantity;
  if (remainingQuantity !== null && remainingQuantity <= 0) {
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
  ITEM: VoucherPackage[];
  PRODUCT: VoucherPackage[];
  ADDON: VoucherPackage[];
  BUNDLE: VoucherPackage[];
} {
  return {
    DISCOUNT: packages.filter((p) => p.voucher_type === "DISCOUNT"),
    ITEM: packages.filter((p) => p.voucher_type === "ITEM"),
    PRODUCT: packages.filter((p) => p.voucher_type === "PRODUCT"),
    ADDON: packages.filter((p) => p.voucher_type === "ADDON"),
    BUNDLE: packages.filter((p) => p.voucher_type === "BUNDLE"),
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
 * Returns a formatted date string for a REDEEMED voucher.
 */
export function formatRedeemedDate(redeemedAt: string | null): string {
  if (!redeemedAt) return "Đã dùng";
  const d = new Date(redeemedAt);
  return `Đã dùng: ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * Returns a short, highlighted text for the Ticket Layout (Left Side).
 * e.g., "10K", "15%", "FREE"
 */
export function getTicketHighlightText(
  vType: string,
  discountType?: "PERCENT" | "FIXED" | null,
  discountValue?: number | null
): { text: string; subtext: string } {
  if (vType === "DISCOUNT") {
    if (discountType === "PERCENT") return { text: `${discountValue}%`, subtext: "GIẢM" };
    if (discountType === "FIXED" && discountValue) {
      if (discountValue >= 1000) return { text: `${Math.floor(discountValue / 1000)}K`, subtext: "GIẢM" };
      return { text: `${discountValue}`, subtext: "GIẢM" };
    }
  }
  if (vType === "ITEM" || vType === "PRODUCT" || vType === "ADDON") {
    return { text: "FREE", subtext: "TẶNG" };
  }
  if (vType === "FREESHIP") {
    return { text: "SHIP", subtext: "FREE" };
  }
  if (vType === "BUNDLE") return { text: "X+Y", subtext: "COMBO" };
  return { text: "GIFT", subtext: "VOUCHER" };
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
  if (v.voucher_type === "ITEM") {
    return `${v.menuItem?.name ?? "Add-on"} miễn phí`;
  }
  if (v.voucher_type === "BUNDLE") return v.package.description ?? "Ưu đãi mua X tặng Y";
  return v.package.name;
}

/**
 * Returns a short benefit description for a VoucherPackage.
 * Used in Section 2 (Exchange) cards.
 */
export function getPackageBenefitText(pkg: VoucherPackage): string {
  if (pkg.voucher_type === "BUNDLE" && pkg.bundleRule) {
    const qualifiers = pkg.bundleRule.qualifier_products
      .map((scope) => scope.menu_item.name)
      .filter((name): name is string => Boolean(name));
    const rewardNames = pkg.bundleRule.reward_kind === "PRODUCT"
      ? pkg.bundleRule.reward_products
          .map((scope) => scope.menu_item.name)
          .filter((name): name is string => Boolean(name))
      : [];
    const qualifierLabel = qualifiers.join(", ") || "món trong nhóm";
    const rewardLabel = pkg.bundleRule.reward_mode === "SAME_CONFIG"
      ? "cùng món và cấu hình"
      : rewardNames.join(", ") || (pkg.bundleRule.reward_kind === "PRODUCT" ? "món trong nhóm" : "addon trong nhóm");
    return `Mua ${pkg.bundleRule.buy_quantity} ${qualifierLabel} · Tặng ${pkg.bundleRule.reward_quantity} ${rewardLabel}`;
  }

  if (pkg.voucher_type === "DISCOUNT") {
    if (pkg.discount_type === "PERCENT") return `Giảm ${pkg.discount_value}% toàn đơn`;
    if (pkg.discount_type === "FIXED")
      return `Giảm ${(pkg.discount_value ?? 0).toLocaleString("vi-VN")}đ toàn đơn`;
  }
  if (pkg.voucher_type === "ITEM" && pkg.menuItem) {
    return `${pkg.menuItem.name} miễn phí`;
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
  "ITEM" | "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE",
  { label: string; badgeCls: string }
> = {
  ITEM: { label: "Add-on", badgeCls: "bg-amber-100 text-amber-800" },
  DISCOUNT: { label: "Giảm giá", badgeCls: "bg-blue-100 text-blue-800" },
  PRODUCT: { label: "Sản phẩm", badgeCls: "bg-green-100 text-green-800" },
  ADDON: { label: "Topping", badgeCls: "bg-purple-100 text-purple-800" },
  FREESHIP: { label: "Freeship", badgeCls: "bg-orange-100 text-orange-800" },
  BUNDLE: { label: "Mua X tặng Y", badgeCls: "bg-rose-100 text-rose-800" },
};
