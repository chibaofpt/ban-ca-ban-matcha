import { cn } from "@/src/utils/cn";
import { Receipt, ShoppingBag, Clock } from "lucide-react";

export type OrderTabKey = "counter" | "customer" | "pending";

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
 */
export function OrderTabs({ activeTab, onTabChange, pendingCount, isAdmin }: OrderTabsProps) {
  return (
    <div className="flex bg-secondary/30 p-1 rounded-xl w-full sm:w-auto overflow-x-auto custom-scrollbar">
      <button
        onClick={() => onTabChange("counter")}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
          activeTab === "counter"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <Receipt size={16} />
        <span>Tại quầy</span>
      </button>

      <button
        onClick={() => onTabChange("customer")}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
          activeTab === "customer"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <ShoppingBag size={16} />
        <span>Khách đặt</span>
      </button>

      {isAdmin && (
        <button
          onClick={() => onTabChange("pending")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
            activeTab === "pending"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Clock size={16} />
          <span>Chờ CK</span>
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
              {pendingCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
