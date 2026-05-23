import { cn } from "@/src/utils/cn";
import type { OrderStatus } from "@/src/lib/types/order";

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const map: Record<OrderStatus, { label: string; color: string }> = {
    PENDING: { label: "Chờ CK", color: "bg-yellow-100 text-yellow-800" },
    ADMIN_CONFIRMED: { label: "Đã xác nhận", color: "bg-blue-100 text-blue-800" },
    STAFF_DONE: { label: "Đã làm xong", color: "bg-green-100 text-green-800" },
    COMPLETED: { label: "Hoàn thành", color: "bg-gray-100 text-gray-800" },
    CANCELLED: { label: "Đã huỷ", color: "bg-red-100 text-red-800" },
  };

  const config = map[status];

  return (
    <span
      className={cn(
        "shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}
