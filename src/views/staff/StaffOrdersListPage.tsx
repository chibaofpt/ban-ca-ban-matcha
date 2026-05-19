"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Phone, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { fetchOrdersList, type OrderRes } from "@/src/services/staffOrdersListService";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const StatusBadge = ({ status }: { status: OrderRes["status"] }) => {
  const map: Record<OrderRes["status"], { label: string; color: string }> = {
    PENDING: { label: "CHỜ NHẬN", color: "bg-yellow-100 text-yellow-800" },
    CONFIRMED: { label: "ĐÃ NHẬN", color: "bg-blue-100 text-blue-800" },
    READY: { label: "XONG", color: "bg-green-100 text-green-800" },
    COMPLETED: { label: "ĐÃ GIAO", color: "bg-gray-100 text-gray-800" },
    CANCELLED: { label: "ĐÃ HUỶ", color: "bg-red-100 text-red-800" },
  };
  const config = map[status] || map.PENDING;
  return (
    <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold", config.color)}>
      {config.label}
    </span>
  );
};

export default function StaffOrdersListPage() {
  const [orders, setOrders] = useState<OrderRes[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchOrdersList();
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Setup simple polling every 10 seconds for new orders
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  if (loading && orders.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="h-6 w-32 bg-secondary/40 rounded-lg animate-pulse mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-secondary/40 rounded-2xl animate-pulse mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3 pb-24">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Đơn hàng</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{orders.length} đơn</span>
          <button onClick={loadData} className="p-1.5 bg-secondary/50 rounded-full hover:bg-secondary/80">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {orders.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">Chưa có đơn hàng nào.</p>
      )}

      {orders.map((order) => {
        const isOpen = !!expanded[order.id];
        const isPending = order.status === "PENDING";
        
        return (
          <div
            key={order.id}
            className={cn(
              "rounded-2xl border bg-card shadow-sm overflow-hidden",
              isPending && "border-yellow-400 border-2 shadow-yellow-100", // Highlight pending orders
              order.status === "CANCELLED" && "opacity-60"
            )}
          >
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate text-sm">
                      {order.user?.name ?? "Khách vãng lai"}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono bg-secondary/50 px-1.5 py-0.5 rounded">
                      #{order.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    {order.user?.phone_number ? (
                      <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                        <Phone size={12} />
                        {order.user.phone_number}
                      </span>
                    ) : (
                      <span className="italic">Không có SĐT</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {formatDateTime(order.created_at)}
                    </span>
                  </div>
                </div>
                <StatusBadge status={order.status} />
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
  );
}

