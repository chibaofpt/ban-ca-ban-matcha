"use client";

import { X } from "lucide-react";
import { Drawer } from "vaul";
import { OrderHistoryItems } from "@/src/components/customer/OrderHistoryItems";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/src/lib/types/order";

interface OrderDetailSheetProps {
  isOpen: boolean;
  order: CustomerHistoryOrder;
  canReorder: boolean;
  onReorder: (item: CustomerHistoryOrderItem) => void;
  onClose: () => void;
}

/** Bottom sheet showing all items for a customer order (vaul Drawer). */
export function OrderDetailSheet({
  isOpen,
  order,
  canReorder,
  onReorder,
  onClose,
}: OrderDetailSheetProps) {
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[101] mx-auto flex max-h-[85dvh] max-w-lg flex-col rounded-t-[20px] bg-card text-foreground outline-none">
          <Drawer.Handle className="mt-3 bg-muted-foreground/30" />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div>
              <Drawer.Title className="text-[15px] font-semibold text-foreground">
                Chi tiết đơn hàng
              </Drawer.Title>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {order.order_code ?? `#${order.id.slice(0, 8)}`} · {itemCount} món
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết đơn hàng"
              className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable content */}
          <Drawer.Description className="sr-only">
            Danh sách tất cả các món trong đơn hàng {order.order_code ?? order.id.slice(0, 8)}.
          </Drawer.Description>
          <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none px-4 py-4">
            <OrderHistoryItems
              order={order}
              canReorder={canReorder}
              onReorder={(item) => {
                onReorder(item);
                onClose();
              }}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
