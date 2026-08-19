"use client";

import { motion } from "framer-motion";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/src/lib/types/order";
import { formatKa, formatOrderSize } from "@/src/utils/display";
import { groupOrderItems } from "@/src/utils/orderHelpers";

interface OrderHistoryItemsProps {
  order: CustomerHistoryOrder;
  canReorder: boolean;
  onReorder: (item: CustomerHistoryOrderItem) => void;
  /** Cap displayed items to this number. Omit to show all. */
  maxItems?: number;
}

/** Renders customer order items and applied order discounts. */
export function OrderHistoryItems({
  order,
  canReorder,
  onReorder,
  maxItems,
}: OrderHistoryItemsProps) {
  const groupedItems = groupOrderItems(order.items);
  const visibleItems =
    maxItems !== undefined ? groupedItems.slice(0, maxItems) : groupedItems;
  const showDiscount = maxItems === undefined || groupedItems.length <= maxItems;

  return (
    <ul className="space-y-4 pb-2 text-sm text-foreground/90">
      {visibleItems.map((item, index) => {
        const itemPrice = item.unit_price_vnd + item.addons_price_vnd;
        const productVoucherDiscount = item.product_voucher_discount_vnd ?? 0;
        const hasProductVoucher = !!item.productVoucher;
        const hasAddonVouchers = (item.addonVouchers ?? []).length > 0;

        return (
          <li key={`${item.menu_item_id}-${index}`} className="flex flex-col gap-1">

            {/* Row 1: name+size LEFT — price · ×qty · [Đặt lại] RIGHT */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13px] font-semibold leading-snug">
                {item.menuItem.name}{" "}
                <span className="font-normal text-muted-foreground">
                  {item.size ? formatOrderSize(item.size) : "Add-on"}
                </span>
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[13px] font-semibold text-primary">
                  {formatKa(itemPrice, "ceil")}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  ×{item.quantity}
                </span>
                {canReorder && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => onReorder(item)}
                    aria-label={`Đặt lại ${item.menuItem.name}`}
                    className="ml-1.5 min-h-7 rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/20"
                  >
                    Đặt lại
                  </motion.button>
                )}
              </div>
            </div>

            {/* Row 2: config chips (sweetness, ice, milk, addons, note) */}
            <OrderItemDetails item={item} />

            {/* Row 3: voucher discount badges */}
            {(hasProductVoucher || hasAddonVouchers) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {hasProductVoucher && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                    🎟 {item.productVoucher!.package.name}
                    {productVoucherDiscount > 0 && (
                      <span className="text-orange-600">
                        -{formatKa(productVoucherDiscount, "floor")}
                      </span>
                    )}
                  </span>
                )}
                {(item.addonVouchers ?? []).map((av, avIdx) => {
                  const disc = av.discount_applied_vnd ?? 0;
                  return (
                    <span
                      key={avIdx}
                      className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700"
                    >
                      🎟 {av.voucher.package.name}
                      {disc > 0 && (
                        <span className="text-green-600">
                          -{formatKa(disc, "floor")}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}

      {/* Order-level voucher discount (full list only) */}
      {showDiscount && order.total_voucher_discount_vnd > 0 && (
        <li className="flex flex-col border-t border-border/30 pt-2 text-[11px] text-green-700">
          <span>Giảm giá: -{formatKa(order.total_voucher_discount_vnd, "floor")}</span>
          {order.discountVouchers && order.discountVouchers.length > 0 && (
            <span className="mt-0.5 block max-w-full truncate font-medium">
              (Voucher:{" "}
              {order.discountVouchers
                .map((entry) => entry.voucher.package.name)
                .join(", ")}
              )
            </span>
          )}
        </li>
      )}
    </ul>
  );
}
