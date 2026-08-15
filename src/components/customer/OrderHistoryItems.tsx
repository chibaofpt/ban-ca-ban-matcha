"use client";

import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
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
}

/** Renders expanded customer order items and applied order discounts. */
export function OrderHistoryItems({
  order,
  canReorder,
  onReorder,
}: OrderHistoryItemsProps) {
  const groupedItems = groupOrderItems(order.items);

  return (
    <ul className="space-y-3 pb-2 text-sm text-foreground/90">
      {groupedItems.map((item, index) => (
        <li key={`${item.menu_item_id}-${index}`} className="flex justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold">
              {item.menuItem.name}{" "}
              <span className="font-normal text-muted-foreground">
                {item.size ? formatOrderSize(item.size) : "Add-on"}
              </span>
            </span>
            <OrderItemDetails item={item} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[13px] font-medium">×{item.quantity}</span>
            {canReorder && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.18 }}
                onClick={() => onReorder(item)}
                aria-label={`Đặt lại ${item.menuItem.name}`}
                className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            )}
          </div>
        </li>
      ))}
      {order.total_voucher_discount_vnd > 0 && (
        <li className="flex flex-col border-t border-border/30 pt-2 text-[11px] text-green-700">
          <span>Giảm giá: -{formatKa(order.total_voucher_discount_vnd, "floor")}</span>
          {order.discountVouchers && order.discountVouchers.length > 0 && (
            <span className="mt-0.5 block max-w-full truncate font-medium">
              (Voucher: {order.discountVouchers.map((entry) => entry.voucher.package.name).join(", ")})
            </span>
          )}
        </li>
      )}
    </ul>
  );
}
