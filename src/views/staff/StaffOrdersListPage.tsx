"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, Phone, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { fetchOrdersList, type OrderRes } from "@/src/services/staffOrdersListService";
import { apiClient } from "@/src/lib/api/client";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { OrderTabs, type OrderTabKey } from "@/src/components/staff/OrderTabs";
import { StatusBadge } from "@/src/components/staff/StatusBadge";
import { toast } from "sonner";

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Chuyển order_type sang nhãn tiếng Việt thân thiện cho UI. */
const formatOrderType = (type: string): string => {
  if (type === "COUNTER") return "Tại quán";
  if (type === "PICKUP") return "Đặt trước";
  if (type === "DELIVERY") return "Giao hàng";
  return type;
};

export default function StaffOrdersListPage() {
  const [activeTab, setActiveTab] = useState<OrderTabKey>("counter");
  const [orders, setOrders] = useState<OrderRes[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (tab: OrderTabKey) => {
    setLoading(true);
    try {
      let data: OrderRes[] = [];
      if (tab === "counter") {
        data = await fetchOrdersList({ order_type: "COUNTER" });
      } else if (tab === "customer") {
        data = await fetchOrdersList({ order_type: "PICKUP,DELIVERY" });
      }
      // Staff cannot access "pending" tab
      setOrders(data);
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải đơn hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(activeTab);

    // Clear previous interval
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Set polling only for "Khách đặt"
    if (activeTab === "customer") {
      intervalRef.current = setInterval(() => {
        loadData("customer");
      }, 15000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeTab, loadData]);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const updateStatus = async (orderId: string, newStatus: OrderRes["status"]) => {
    try {
      await apiClient.patch(`/api/staff/orders/${orderId}`, { status: newStatus });
      toast.success("Cập nhật trạng thái thành công");
      loadData(activeTab);
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Cập nhật thất bại");
      }
    }
  };

  const renderActionButtons = (order: OrderRes) => {
    if (order.status === "ADMIN_CONFIRMED") {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateStatus(order.id, "STAFF_DONE");
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Đã làm xong
        </button>
      );
    }
    if (order.status === "STAFF_DONE") {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateStatus(order.id, "COMPLETED");
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
        >
          Hoàn thành
        </button>
      );
    }
    return null;
  };

  return (
    <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Đơn hàng</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{orders.length} đơn</span>
          <button onClick={() => loadData(activeTab)} className="p-1.5 bg-secondary/50 rounded-full hover:bg-secondary/80">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <OrderTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={0} // Staff doesn't see pending tab
        isAdmin={false}
      />

      {loading && orders.length === 0 ? (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border bg-card shadow-sm overflow-hidden p-4 space-y-3 animate-pulse">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="h-4 w-28 bg-secondary/60 rounded" />
                    <div className="h-4 w-16 bg-secondary/40 rounded-full" />
                    <div className="h-4 w-14 bg-secondary/40 rounded-full" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-3 w-24 bg-secondary/40 rounded" />
                    <div className="h-3 w-20 bg-secondary/40 rounded" />
                  </div>
                </div>
                <div className="space-y-2 items-end flex flex-col">
                  <div className="h-3 w-28 bg-secondary/40 rounded" />
                  <div className="h-8 w-20 bg-primary/10 rounded-lg" />
                </div>
              </div>
              <div className="h-9 bg-secondary/30 rounded-xl" />
              <div className="flex justify-between border-t border-border pt-3">
                <div className="h-3 w-16 bg-secondary/40 rounded" />
                <div className="h-5 w-20 bg-primary/10 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">Không tìm thấy đơn hàng nào.</p>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {orders.map((order) => {
            const isOpen = !!expanded[order.id];
            
            return (
              <div
                key={order.id}
                className={cn(
                  "rounded-2xl border bg-card shadow-sm overflow-hidden transition",
                  order.status === "CANCELLED" && "opacity-60"
                )}
              >
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">
                            {order.user?.name ?? "Khách vãng lai"}
                          </span>
                          <StatusBadge status={order.status} />
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            order.order_type === "COUNTER"
                              ? "bg-blue-100 text-blue-700"
                              : order.order_type === "DELIVERY"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {formatOrderType(order.order_type)}
                          </span>
                        </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} />
                          {order.user?.phone_number ?? "—"}
                        </span>
                        {order.order_code ? (
                          <span className="font-mono bg-secondary/50 px-1.5 rounded font-bold">
                            {order.order_code}
                          </span>
                        ) : (
                          <span className="font-mono bg-secondary/50 px-1.5 rounded">
                            #{order.id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="text-xs text-muted-foreground">
                        <Clock size={12} className="inline mr-1" />
                        {formatDateTime(order.created_at)}
                      </div>
                      {renderActionButtons(order)}
                    </div>
                  </div>

                  <button
                    onClick={() => toggle(order.id)}
                    className="w-full flex items-center justify-between text-sm text-foreground/80 hover:text-foreground bg-secondary/20 p-2 rounded-xl"
                  >
                    <span className="font-medium">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} món
                    </span>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isOpen && (
                    <ul className="space-y-3 text-sm text-foreground/90 pt-1">
                      {order.items.map((it, idx) => (
                         <li key={idx} className="flex justify-between gap-3">
                         <div className="flex flex-col">
                           <span className="font-semibold">{it.menuItem.name} <span className="font-normal text-muted-foreground">({it.size})</span></span>
                           <OrderItemDetails item={it} />
                         </div>
                         <span className="font-medium text-foreground shrink-0 mt-0.5">×{it.quantity}</span>
                       </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">Tổng thu</span>
                    <span className="font-bold text-primary text-base">
                      {(order.total_vnd / 1000).toLocaleString("vi-VN")}K
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
