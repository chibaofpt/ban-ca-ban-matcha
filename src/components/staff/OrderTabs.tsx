import { cn } from "@/src/utils/cn";
import { List, Receipt, ShoppingBag, Clock, XCircle } from "lucide-react";
import { motion } from "framer-motion";

export type OrderTabKey = "all" | "counter" | "customer" | "pending" | "cancelled";

interface OrderTabsProps {
  activeTab: OrderTabKey;
  onTabChange: (tab: OrderTabKey) => void;
  pendingCount: number;
  isAdmin: boolean;
}

/** 
 * Reusable tab bar for Staff and Admin order pages.
 * - All: all non-cancelled orders (Admin only)
 * - Tại quầy: COUNTER orders
 * - Khách đặt: PICKUP/DELIVERY orders (ADMIN_CONFIRMED and beyond)
 * - Chờ CK: Admin sees all PENDING; Staff sees only their own counter transfers
 * - Đã huỷ: CANCELLED orders (Admin only)
 */
export function OrderTabs({ activeTab, onTabChange, pendingCount, isAdmin }: OrderTabsProps) {
  const tabs = [
    ...(isAdmin ? [
      { id: "all" as OrderTabKey, label: "All", icon: List }
    ] : []),
    { id: "counter" as OrderTabKey, label: "Tại quầy", icon: Receipt },
    { id: "customer" as OrderTabKey, label: "Khách đặt", icon: ShoppingBag },
    { id: "pending" as OrderTabKey, label: "Chờ CK", icon: Clock },
    ...(isAdmin ? [
      { id: "cancelled" as OrderTabKey, label: "Đã huỷ", icon: XCircle }
    ] : [])
  ];

  return (
    <div className="flex bg-secondary/30 p-1 rounded-lg w-full">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative flex min-h-10 flex-1 items-center justify-center py-2 px-1 sm:px-3 rounded-md transition-colors",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="order-tab-indicator"
                className="absolute inset-0 bg-primary rounded-md shadow-sm pointer-events-none"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <motion.div
              whileTap={{ scale: 0.92 }}
              className="flex items-center justify-center gap-1 sm:gap-1.5 w-full relative z-10 text-[11px] sm:text-xs font-medium whitespace-nowrap"
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{tab.label}</span>
              {tab.id === "pending" && pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[9px] sm:text-[10px] leading-none px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ml-0.5">
                  {pendingCount}
                </span>
              )}
            </motion.div>
          </button>
        );
      })}
    </div>
  );
}
