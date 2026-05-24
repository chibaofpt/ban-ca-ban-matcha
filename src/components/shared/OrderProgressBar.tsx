import { cn } from "@/src/utils/cn";
import type { OrderStatus } from "@/src/lib/types/order";
import { ShoppingBag, Check, ChefHat, Star } from "lucide-react";

interface StepConfig {
  icon: React.ReactNode;
  activeAt: OrderStatus;
  title: string;
  subtitle: string;
}

/** 4 nodes on the horizontal progress bar. */
const STEPS: StepConfig[] = [
  {
    icon: <ShoppingBag size={14} />,
    activeAt: "PENDING",
    title: "Chờ thanh toán",
    subtitle: "Quét QR và ghi mã đơn",
  },
  {
    icon: <Check size={14} />,
    activeAt: "ADMIN_CONFIRMED",
    title: "Đã xác nhận",
    subtitle: "Nhân viên đang pha chế",
  },
  {
    icon: <ChefHat size={14} />,
    activeAt: "STAFF_DONE",
    title: "Sẵn sàng!",
    subtitle: "Đến quầy nhận đồ nhé 🎉",
  },
  {
    icon: <Star size={14} />,
    activeAt: "COMPLETED",
    title: "Hoàn thành",
    subtitle: "",
  },
];

/** Maps status to the step index (0-based). */
const STATUS_INDEX: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  ADMIN_CONFIRMED: 1,
  STAFF_DONE: 2,
  COMPLETED: 3,
};

interface OrderProgressBarProps {
  status: OrderStatus;
}

/**
 * Horizontal 4-node progress bar for customer/pickup orders.
 * Returns null for COMPLETED and CANCELLED — caller handles those states separately.
 */
export function OrderProgressBar({ status }: OrderProgressBarProps) {
  // Only render for in-progress states
  if (status === "COMPLETED" || status === "CANCELLED") return null;

  const activeIndex = STATUS_INDEX[status] ?? 0;

  return (
    <div className="w-full py-2">
      {/* Nodes + connectors row */}
      <div className="relative flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;

          return (
            <div key={idx} className="relative flex flex-col items-center flex-1">
              {/* Connector line (before this node, skip first) */}
              {idx > 0 && (
                <div
                  className={cn(
                    "absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2",
                    isCompleted || isActive ? "bg-primary" : "bg-border"
                  )}
                />
              )}

              {/* Node dot */}
              <div
                className={cn(
                  "relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  isCompleted
                    ? "bg-primary border-primary text-white"
                    : isActive
                    ? "bg-primary border-primary text-white"
                    : "bg-background border-border text-muted-foreground"
                )}
              >
                {step.icon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active step title + subtitle — shown below the active node */}
      {STEPS[activeIndex] && (
        <div className="mt-3 w-full">
          <div
            className={cn(
              "relative inline-block px-1",
              activeIndex === 0 && "text-left",
              (activeIndex === 1 || activeIndex === 2) && "text-center",
              activeIndex === 3 && "text-right"
            )}
            style={{
              left: activeIndex === 2
                ? `calc(${(activeIndex / 3) * 100}% - 5%)`
                : `${(activeIndex / 3) * 100}%`,
              transform: activeIndex === 0 
                ? "none" 
                : activeIndex === 3 
                ? "translateX(-100%)" 
                : "translateX(-50%)",
            }}
          >
            <p className="text-xs font-bold text-foreground leading-tight">
              {STEPS[activeIndex].title}
            </p>
            {STEPS[activeIndex].subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {STEPS[activeIndex].subtitle}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
