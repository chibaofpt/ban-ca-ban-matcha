import type { CartProjectionResult } from "@/src/lib/types/cart";
import { projectCart, type CartProjectionInput } from "./cartProjection";
import type { CalcOrderResult } from "@/src/utils/orderCalculator";

export interface StaffCartSummaryRow {
  label: string;
  amountVnd: number;
  discount: boolean;
}

/** Group canonical calculator amounts into the compact POS payment breakdown. */
export function getStaffCartSummaryRows(totals: CalcOrderResult): StaffCartSummaryRow[] {
  const productDiscountVnd = totals.itemResults.reduce((sum, item) =>
    sum + (item.bundle_discount_vnd ?? 0) + item.product_voucher_discount_vnd + item.item_voucher_discount_vnd, 0);
  const addonDiscountVnd = totals.itemResults.reduce((sum, item) =>
    sum + item.addon_vouchers.reduce((total, addon) => total + addon.discount_applied_vnd, 0), 0);
  const rows: StaffCartSummaryRow[] = [
    { label: "Tổng tiền", amountVnd: totals.subtotal_vnd, discount: false },
    { label: "Giảm giá món", amountVnd: productDiscountVnd, discount: true },
    { label: "Giảm giá topping", amountVnd: addonDiscountVnd, discount: true },
    { label: "Tiền ship", amountVnd: totals.shipping_fee_vnd, discount: false },
    { label: "Giảm tiền ship", amountVnd: totals.freeship_discount_vnd, discount: true },
    { label: "Giảm toàn đơn", amountVnd: totals.total_voucher_discount_vnd, discount: true },
    { label: "Thanh toán", amountVnd: totals.grand_total_vnd, discount: false },
  ];
  return rows.filter((row, index) => row.amountVnd !== 0 || index === rows.length - 1);
}

/** Keep cached wallet data available for display without changing checkout verification. */
export function resolveStaffCartDisplayProjection(
  verified: CartProjectionResult,
  cachedInput: CartProjectionInput,
): CartProjectionResult {
  if (!verified.revalidating || !cachedInput.vouchers || !cachedInput.menuData || !cachedInput.powderData) return verified;
  return projectCart(cachedInput);
}
