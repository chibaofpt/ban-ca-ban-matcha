"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, Phone, Clock, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { fetchOrdersList, type OrderRes } from "@/src/services/staffOrdersListService";
import { apiClient } from "@/src/lib/api/client";
import { usePolling } from "@/src/hooks/usePolling";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { OrderTabs, type OrderTabKey } from "@/src/components/staff/OrderTabs";
import { OrderProgressBar } from "@/src/components/shared/OrderProgressBar";
import { toast } from "sonner";

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatTimeOnly = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function StaffOrdersListPage() {
  const [activeTab, setActiveTab] = useState<OrderTabKey>("counter");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Reset page when changing tabs
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const fetchOrdersFn = useCallback(async () => {
    let orderTypeParam = "";
    let statusParam = "";

    if (activeTab === "counter") {
      orderTypeParam = "COUNTER";
    } else if (activeTab === "customer") {
      orderTypeParam = "PICKUP,DELIVERY";
    } else if (activeTab === "pending") {
      statusParam = "PENDING";
    } else if (activeTab === "cancelled") {
      statusParam = "CANCELLED";
    }

    return await fetchOrdersList({
      order_type: orderTypeParam || undefined,
      status: statusParam || undefined,
      page,
      limit: 10,
    });
  }, [activeTab, page]);

  const { data, isInitialLoading, isRefreshing, refetch } = usePolling({
    fetcher: fetchOrdersFn,
    interval: activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000,
    dependencies: [activeTab, page],
  });

  const orders = data?.data || [];
  const totalPages = data?.meta.totalPages || 1;

  // Background polling cho pendingCount
  const fetchPendingCountAPI = useCallback(async () => {
    try {
      const res = await fetchOrdersList({ status: "PENDING", limit: 1 });
      return res;
    } catch {
      return null;
    }
  }, []);

  const { data: pendingData } = usePolling({
    fetcher: fetchPendingCountAPI,
    interval: 20000,
  });

  const pendingCount = pendingData?.meta?.total || 0;

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const updateStatus = async (orderId: string, newStatus: OrderRes["status"]) => {
    try {
      await apiClient.patch(`/api/staff/orders/${orderId}`, { status: newStatus });
      toast.success("Cập nhật trạng thái thành công");
      refetch();
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
          className="w-full px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
          className="w-full px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Khách đã đến lấy
        </button>
      );
    }
    return null;
  };

  return (
    <div className="px-4 md:px-0 py-4 space-y-4 pb-24 md:pb-8 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Đơn hàng</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{orders.length} đơn</span>
          <button onClick={refetch} className="p-1.5 bg-secondary/50 rounded-full hover:bg-secondary/80">
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <OrderTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
        isAdmin={true}
      />

      {isInitialLoading ? (
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border bg-card shadow-sm overflow-hidden p-4 space-y-3 animate-pulse">
              <div className="flex justify-between items-start">
                <div className="h-4 w-32 bg-secondary/60 rounded" />
                <div className="h-3 w-28 bg-secondary/40 rounded" />
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-24 bg-secondary/40 rounded" />
                <div className="h-3 w-20 bg-secondary/40 rounded" />
              </div>
              <div className="h-8 bg-secondary/30 rounded-xl" />
              <div className="h-9 bg-secondary/20 rounded-xl" />
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
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 mt-4">
          {orders.map((order) => {
            const isOpen = !!expanded[order.id];
            const isTerminal = order.status === "COMPLETED" || order.status === "CANCELLED";

            return (
              <div
                key={order.id}
                className={cn(
                  "rounded-2xl border bg-card shadow-sm overflow-hidden transition",
                  order.status === "CANCELLED" && "opacity-60"
                )}
              >
                <div className="p-4 space-y-3">
                  {/* Row 1: Mã đơn + thời gian */}
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="font-mono font-bold text-sm text-foreground">
                        {order.order_code ?? `#${order.id.slice(0, 8)}`}
                      </div>
                      {order.pickup_time && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-md w-fit">
                          <Clock size={10} />
                          Nhận lúc: {formatTimeOnly(order.pickup_time)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      <Clock size={12} className="inline mr-1" />
                      {formatDateTime(order.created_at)}
                    </div>
                  </div>

                  {/* Row 2: Tên khách + SĐT */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-sm font-medium text-foreground">
                      {order.user?.name ?? "Khách vãng lai"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone size={11} />
                      {order.user?.phone_number ?? "—"}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  {!isTerminal && (
                    <div className="pt-1">
                      <OrderProgressBar status={order.status} />
                    </div>
                  )}

                  {/* Action buttons */}
                  {renderActionButtons(order)}

                  {/* Expand toggle */}
                  <button
                    onClick={() => toggle(order.id)}
                    className="w-full flex items-center justify-between text-sm text-foreground/80 hover:text-foreground bg-secondary/20 p-2 rounded-xl"
                  >
                    <span className="font-medium">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} món
                    </span>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {/* Expanded item list */}
                  {isOpen && (
                    <ul className="space-y-3 text-sm text-foreground/90 pt-1">
                      {order.items.map((it, idx) => (
                        <li key={idx} className="flex justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              {it.menuItem.name}{" "}
                              <span className="font-normal text-muted-foreground">({it.size})</span>
                            </span>
                            <OrderItemDetails item={it} />
                          </div>
                          <span className="font-medium text-foreground shrink-0 mt-0.5">×{it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Footer */}
                  <div className="border-t border-border pt-3">
                    <div className="flex justify-end">
                      <span className="font-bold text-primary text-base">
                        {(order.total_vnd / 1000).toLocaleString("vi-VN")}K
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {isTerminal ? (
                        <span className={cn(
                          "text-xs font-semibold flex items-center gap-1",
                          order.status === "COMPLETED" ? "text-primary" : "text-red-500"
                        )}>
                          {order.status === "COMPLETED" ? (
                            <>
                              <CheckCircle2 size={13} className="text-primary" />
                              <span>Đã hoàn thành</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={13} className="text-red-500" />
                              <span>Đã huỷ</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="col-span-full flex justify-center items-center gap-2 pt-6">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border bg-card text-sm font-medium hover:bg-secondary/40 disabled:opacity-50 transition"
              >
                Trang trước
              </button>
              <span className="text-sm font-medium text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border bg-card text-sm font-medium hover:bg-secondary/40 disabled:opacity-50 transition"
              >
                Trang sau
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
