import { cn } from "@/src/utils/cn";
import type { OrderStatus } from "@/src/lib/types/order";
import { Check, Clock, ChefHat, ShoppingBag, PackageCheck } from "lucide-react";

interface Step {
  label: string;
  subLabel?: string;
  icon: React.ReactNode;
  /** Status at which this step becomes "completed". */
  completedAt: OrderStatus[];
  /** Status at which this step is "active" (in progress). */
  activeAt: OrderStatus[];
}

const STEPS: Step[] = [
  {
    label: "Đặt hàng",
    subLabel: "Đơn hàng đã được tạo",
    icon: <ShoppingBag size={16} />,
    completedAt: ["ADMIN_CONFIRMED", "STAFF_DONE", "COMPLETED"],
    activeAt: ["PENDING"],
  },
  {
    label: "Xác nhận thanh toán",
    subLabel: "Admin xác nhận chuyển khoản",
    icon: <Check size={16} />,
    completedAt: ["STAFF_DONE", "COMPLETED"],
    activeAt: ["ADMIN_CONFIRMED"],
  },
  {
    label: "Đang chuẩn bị",
    subLabel: "Nhân viên đang làm đồ",
    icon: <ChefHat size={16} />,
    completedAt: ["COMPLETED"],
    activeAt: ["STAFF_DONE"],
  },
  {
    label: "Sẵn sàng lấy",
    subLabel: "Đến quầy lấy đơn",
    icon: <PackageCheck size={16} />,
    completedAt: ["COMPLETED"],
    activeAt: ["STAFF_DONE"],
  },
  {
    label: "Hoàn thành",
    subLabel: "Cảm ơn bạn đã ủng hộ!",
    icon: <Clock size={16} />,
    completedAt: [],
    activeAt: ["COMPLETED"],
  },
];

interface OrderStatusTimelineProps {
  status: OrderStatus;
}

/** Vertical progress timeline showing which stage the order is at. */
export function OrderStatusTimeline({ status }: OrderStatusTimelineProps) {
  const isCancelled = status === "CANCELLED";

  return (
    <ol className="relative space-y-0">
      {STEPS.map((step, idx) => {
        const isCompleted = step.completedAt.includes(status);
        const isActive = step.activeAt.includes(status);
        const isLast = idx === STEPS.length - 1;

        return (
          <li key={step.label} className="flex gap-3">
            {/* Connector line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
                  isCancelled
                    ? "border-red-200 bg-red-50 text-red-400"
                    : isCompleted
                    ? "border-green-500 bg-green-500 text-white"
                    : isActive
                    ? "border-primary bg-primary text-primary-foreground animate-pulse"
                    : "border-border bg-background text-muted-foreground"
                )}
              >
                {isCompleted ? <Check size={14} /> : step.icon}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[24px] my-1 transition-colors",
                    isCompleted ? "bg-green-500" : "bg-border"
                  )}
                />
              )}
            </div>

            {/* Step content */}
            <div className="pb-5 pt-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold leading-none",
                  isCancelled
                    ? "text-red-400"
                    : isCompleted || isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.subLabel && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.subLabel}</p>
              )}
            </div>
          </li>
        );
      })}

      {isCancelled && (
        <li className="mt-2 text-sm text-red-500 font-medium flex items-center gap-2">
          <span className="text-lg">❌</span> Đơn hàng đã bị huỷ
        </li>
      )}
    </ol>
  );
}
