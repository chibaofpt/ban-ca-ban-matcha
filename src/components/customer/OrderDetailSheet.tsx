"use client";

import { OrderReadOnlyDetail } from "@/src/components/shared/OrderReadOnlyDetail";
import { OrderHistoryItems } from "@/src/components/customer/OrderHistoryItems";
import type { CustomerHistoryOrder, CustomerHistoryOrderItem } from "@/src/lib/types/order";

interface OrderDetailSheetProps {
  isOpen: boolean;
  order: CustomerHistoryOrder;
  canReorder: boolean;
  onReorder: (item: CustomerHistoryOrderItem) => void;
  onClose: () => void;
}

/** Show the shared read-only detail frame with the existing customer reorder action. */
export function OrderDetailSheet({ isOpen, order, canReorder, onReorder, onClose }: OrderDetailSheetProps) {
  return (
    <OrderReadOnlyDetail open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} order={order}>
      <OrderHistoryItems order={order} canReorder={canReorder} onReorder={(item) => { onReorder(item); onClose(); }} />
    </OrderReadOnlyDetail>
  );
}