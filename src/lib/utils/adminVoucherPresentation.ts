import type { VoucherPackage, VoucherPackageStats } from "@/src/services/adminVoucherService";
import { formatInclusiveEndDate } from "@/src/lib/utils/adminVoucherForm";

export type VoucherPackageOperationalStatus = "ENDED" | "SOLD_OUT" | "PAUSED" | "ACTIVE";
type StatusSource = { is_active: boolean; ends_at: string | null; quantity: number | null; stats?: VoucherPackageStats };
type BenefitSource = Pick<VoucherPackage, "voucher_type"> & Partial<VoucherPackage>;

const money = (value: number | null | undefined) => `${(value ?? 0).toLocaleString("vi-VN")}đ`;
const emptyStats: VoucherPackageStats = { issued_count: 0, active_count: 0, reserved_count: 0, redeemed_count: 0, expired_count: 0, refunded_count: 0, remaining_quantity: null };

/** Resolves package status using the approved operational precedence. */
export function getVoucherPackageStatus(pkg: StatusSource, now = new Date()): VoucherPackageOperationalStatus {
  const stats = pkg.stats ?? emptyStats;
  if (pkg.ends_at && new Date(pkg.ends_at) <= now) return "ENDED";
  if (pkg.quantity !== null && stats.remaining_quantity === 0) return "SOLD_OUT";
  if (!pkg.is_active) return "PAUSED";
  return "ACTIVE";
}

/** Formats issued capacity and redemption without an empty 0/0 ratio. */
export function summarizeVoucherCapacity(pkg: Pick<StatusSource, "quantity" | "stats">): string {
  const stats = pkg.stats ?? emptyStats;
  if (pkg.quantity === null) return stats.issued_count === 0 ? "Đã cấp 0 · Không giới hạn · Chưa có lượt sử dụng" : `Đã cấp ${stats.issued_count} · Không giới hạn · Đã dùng ${stats.redeemed_count}/${stats.issued_count}`;
  const issued = `Đã cấp ${stats.issued_count}/${pkg.quantity}`;
  return stats.issued_count === 0 ? `${issued} · Chưa có lượt sử dụng` : `${issued} · Đã dùng ${stats.redeemed_count}/${stats.issued_count}`;
}

/** Formats the primary package eligibility condition for cards. */
export function summarizeVoucherCondition(pkg: BenefitSource): string {
  if (pkg.min_order_vnd) return `Đơn từ ${money(pkg.min_order_vnd)}`;
  if (pkg.voucher_type === "PRODUCT_DISCOUNT") return `Áp dụng ${(pkg.eligible_menu_items ?? []).map((item) => item.name).join(", ") || "món đã chọn"}`;
  if (pkg.voucher_type === "PRODUCT" || pkg.voucher_type === "ITEM") return `Áp dụng ${pkg.menuItem?.name ?? "món đã chọn"}`;
  if (pkg.voucher_type === "ADDON") return `Áp dụng ${pkg.addonOption?.label ?? "addon đã chọn"}`;
  if (pkg.voucher_type === "BUNDLE") return `Tối đa ${pkg.bundleRule?.max_applications_per_order ?? 1} lần/đơn`;
  return "Không yêu cầu giá trị đơn tối thiểu";
}

/** Formats the inclusive issuance deadline using the canonical admin helper. */
export function summarizeVoucherDeadline(pkg: Pick<VoucherPackage, "ends_at">): string {
  return pkg.ends_at ? `Phát hành đến hết ${formatInclusiveEndDate(pkg.ends_at)}` : "Không giới hạn hạn phát hành";
}

/** Produces a concise Vietnamese benefit summary for every voucher type. */
export type ExtendedBenefitSource = BenefitSource & { max_discount_vnd?: number | null };
export function summarizeVoucherBenefit(pkg: ExtendedBenefitSource): string {
  if (pkg.voucher_type === "BUNDLE" && pkg.bundleRule) return `Mua ${pkg.bundleRule.buy_quantity} tặng ${pkg.bundleRule.reward_quantity}`;
  if (pkg.voucher_type === "DISCOUNT") {
    if (pkg.discount_type === "PERCENT") {
      return pkg.max_discount_vnd ? `Giảm ${pkg.discount_value ?? 0}% (tối đa ${money(pkg.max_discount_vnd)})` : `Giảm ${pkg.discount_value ?? 0}%`;
    }
    return `Giảm ${money(pkg.discount_value)}`;
  }
  if (pkg.voucher_type === "PRODUCT_DISCOUNT") return pkg.product_discount_mode === "PAY_AS_SIZE" ? `Chỉ trả giá size ${pkg.reference_size ?? "tham chiếu"}` : `Giảm ${money(pkg.discount_value)}`;
  if (pkg.voucher_type === "ITEM" || pkg.voucher_type === "PRODUCT") return `Tặng ${pkg.menuItem?.name ?? "một sản phẩm"}`;
  if (pkg.voucher_type === "ADDON") return `Tặng ${pkg.addonOption?.label ?? "addon"}`;
  return `Hỗ trợ ${money(pkg.covered_delivery_fee_vnd)} phí giao`;
}
