import { cn } from "@/src/utils/cn";
import { Receipt, ShoppingBag, Clock, XCircle } from "lucide-react";

export type OrderTabKey = "counter" | "customer" | "pending" | "cancelled";

interface OrderTabsProps {
  activeTab: OrderTabKey;
  onTabChange: (tab: OrderTabKey) => void;
  pendingCount: number;
  isAdmin: boolean;
}

/** 
 * Reusable tab bar for Staff and Admin order pages.
 * - Tại quầy: COUNTER orders
 * - Khách đặt: PICKUP/DELIVERY orders (ADMIN_CONFIRMED and beyond)
 * - Chờ CK: PENDING orders (Admin only)
 * - Đã huỷ: CANCELLED orders (Admin only)
 */
export function OrderTabs({ activeTab, onTabChange, pendingCount, isAdmin }: OrderTabsProps) {
  return (
    <div className="flex bg-secondary/30 p-1 rounded-lg w-full">
      <button
        onClick={() => onTabChange("counter")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-md text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap",
          activeTab === "counter"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span>Tại quầy</span>
      </button>

      <button
        onClick={() => onTabChange("customer")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-md text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap",
          activeTab === "customer"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span>Khách đặt</span>
      </button>

      {isAdmin && (
        <>
          <button
            onClick={() => onTabChange("pending")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-md text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap",
              activeTab === "pending"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Chờ CK</span>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] sm:text-[10px] leading-none px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange("cancelled")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-2 rounded-md text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap",
              activeTab === "cancelled"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Đã huỷ</span>
          </button>
        </>
      )}
    </div>
  );
}
