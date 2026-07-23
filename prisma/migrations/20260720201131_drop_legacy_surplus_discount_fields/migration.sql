-- Drop legacy field: order_items.surplus_points
-- Previously stored per-item PRODUCT voucher surplus points (old rounding logic).
-- Surplus is now computed on-demand from order_items.unit_price_vnd and vouchers.covered_price_vnd.
-- Aggregate surplus is recorded in points_log with reason = 'voucher_surplus'.
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "surplus_points";

-- Drop legacy field: order_discount_vouchers.discount_applied_vnd
-- Previously stored an inaccurate equal-split of the total DISCOUNT amount across vouchers.
-- The source of truth for DISCOUNT amount is orders.total_voucher_discount_vnd.
ALTER TABLE "order_discount_vouchers" DROP COLUMN IF EXISTS "discount_applied_vnd";
