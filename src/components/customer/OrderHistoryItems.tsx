"use client";

import { motion } from "framer-motion";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/src/lib/types/order";
import { formatKa, formatOrderSize } from "@/src/utils/display";


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
  const groupedItems = order.items;
  const visibleItems =
    maxItems !== undefined ? groupedItems.slice(0, maxItems) : groupedItems;
  const showDiscount = maxItems === undefined || groupedItems.length <= maxItems;
  const showItemDiscounts = maxItems === undefined;

  const orderDiscountVouchers = order.discountVouchers ?? [];
  const hasOrderDiscount = order.total_voucher_discount_vnd > 0;

  return (
    <ul className="space-y-4 pb-2 text-sm text-foreground/90">
      {visibleItems.map((item, index) => {
        const itemPrice = item.unit_price_vnd + item.addons_price_vnd;
        const itemDiscount = item.total_discount_vnd ?? 0;

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
                {showItemDiscounts ? (
                  <div className="flex flex-col items-end leading-tight">
                    {itemDiscount > 0 && (
                      <span className="text-[11px] font-light text-foreground line-through">
                        {formatKa(itemPrice)}
                      </span>
                    )}
                    <span className={itemDiscount > 0 ? "text-[13px] font-bold text-foreground" : "text-[13px] font-semibold text-foreground"}>
                      {formatKa(itemPrice - itemDiscount / item.quantity)}
                    </span>
                  </div>
                ) : (
                  <span className="text-[13px] font-semibold text-primary">
                    {formatKa(itemPrice, "ceil")}
                  </span>
                )}
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

          </li>
        );
      })}

      {/* Order-level voucher discount (full list only) */}
      {showDiscount && hasOrderDiscount && (
        <li className="flex flex-col border-t border-border/30 pt-2 text-[11px] text-primary">
          <span>Giảm giá: -{formatKa(order.total_voucher_discount_vnd, "floor")}</span>
          {orderDiscountVouchers.length > 0 && (
            <span className="mt-0.5 block max-w-full truncate font-medium">
              (Voucher:{" "}
              {orderDiscountVouchers
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
