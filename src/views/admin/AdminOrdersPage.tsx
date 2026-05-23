"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, Phone, Clock, Search, FilterX, Filter, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { fetchAdminOrders, confirmPayment, adminCancelOrder, type AdminOrderRes } from "@/src/services/adminOrderService";
import { apiClient } from "@/src/lib/api/client";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { OrderTabs, type OrderTabKey } from "@/src/components/staff/OrderTabs";
import { StatusBadge } from "@/src/components/staff/StatusBadge";
import { toast } from "sonner";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";

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

export default function AdminOrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderTabKey>("counter");
  const [orders, setOrders] = useState<AdminOrderRes[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    search: "",
    staffName: "",
    startDate: getTodayStr(),
    endDate: "",
  });
  const [draftFilters, setDraftFilters] = useState(activeFilters);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCountIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (tab: OrderTabKey, filters = activeFilters) => {
    setLoading(true);
    try {
      const startIso = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).toISOString() : undefined;
      const endIso = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`).toISOString() : undefined;

      let orderTypeParam = "";
      let statusParam = "";

      if (tab === "counter") {
        orderTypeParam = "COUNTER";
      } else if (tab === "customer") {
        orderTypeParam = "PICKUP,DELIVERY";
      } else if (tab === "pending") {
        statusParam = "PENDING";
        // Ignore date filters for pending tab as they are real-time
      }

      const data = await fetchAdminOrders({
        search: filters.search || undefined,
        staffName: filters.staffName || undefined,
        startDate: tab !== "pending" ? startIso : undefined,
        endDate: tab !== "pending" ? endIso : undefined,
        order_type: orderTypeParam || undefined,
      });

      // Inject status filter manually for the mock/admin API if not fully supported by fetchAdminOrders
      // Our fetchAdminOrders passes these along. However, we only added 'order_type' to AdminOrderFilters in service.
      // Let's rely on the service fetching correctly.
      let filteredData = data;
      if (statusParam === "PENDING") {
        filteredData = data.filter((o) => o.status === "PENDING");
      } else if (tab === "customer") {
        filteredData = data.filter((o) => o.order_type !== "COUNTER" && o.status !== "PENDING");
      } else if (tab === "counter") {
        filteredData = data.filter((o) => o.order_type === "COUNTER");
      }
      
      setOrders(filteredData);
      
      if (tab === "pending") {
        setPendingCount(filteredData.length);
      }
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải đơn hàng");
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  // Background polling for pending count
  const fetchPendingCount = useCallback(async () => {
    try {
      // Just fetch pending tab to get count
      const res = await apiClient.get('/api/admin/orders?status=PENDING');
      const data: AdminOrderRes[] = res.data.data;
      const count = data.filter(o => o.status === "PENDING").length;
      setPendingCount(count);
    } catch (e) {
      // Ignore background errors
    }
  }, []);

  useEffect(() => {
    loadData(activeTab, activeFilters);

    if (intervalRef.current) clearInterval(intervalRef.current);

    if (activeTab === "customer") {
      intervalRef.current = setInterval(() => loadData("customer", activeFilters), 15000);
    } else if (activeTab === "pending") {
      intervalRef.current = setInterval(() => loadData("pending", activeFilters), 10000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeTab, activeFilters, loadData]);

  useEffect(() => {
    // Global poll for pending count every 20s if not on pending tab
    if (activeTab !== "pending") {
      fetchPendingCount();
      pendingCountIntervalRef.current = setInterval(fetchPendingCount, 20000);
    } else {
      if (pendingCountIntervalRef.current) clearInterval(pendingCountIntervalRef.current);
    }
    return () => {
      if (pendingCountIntervalRef.current) clearInterval(pendingCountIntervalRef.current);
    };
  }, [activeTab, fetchPendingCount]);


  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const openFilterModal = () => {
    setDraftFilters(activeFilters);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setActiveFilters(draftFilters);
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    const empty = { search: "", staffName: "", startDate: "", endDate: "" };
    setDraftFilters(empty);
    setActiveFilters(empty);
    setShowFilterModal(false);
  };

  const activeFilterCount = Object.values(activeFilters).filter((v) => v).length;

  const handleConfirmPayment = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Xác nhận thanh toán",
      message: "Bạn có chắc chắn đã nhận được tiền chuyển khoản cho đơn này?",
      isDestructive: false,
      onConfirm: async () => {
        setConfirmModal((s) => ({ ...s, isOpen: false }));
        try {
          await confirmPayment(orderId);
          toast.success("Xác nhận thanh toán thành công");
          loadData(activeTab, activeFilters);
          if (activeTab === "pending") setPendingCount((prev) => Math.max(0, prev - 1));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Xác nhận thất bại";
          toast.error(msg);
        }
      },
    });
  };

  const handleCancelOrder = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Huỷ đơn hàng",
      message: "Bạn có chắc chắn muốn huỷ đơn hàng này?",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal((s) => ({ ...s, isOpen: false }));
        try {
          await adminCancelOrder(orderId);
          toast.success("Đã huỷ đơn hàng");
          loadData(activeTab, activeFilters);
          if (activeTab === "pending") setPendingCount((prev) => Math.max(0, prev - 1));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Huỷ thất bại";
          toast.error(msg);
        }
      },
    });
  };

  const renderActionButtons = (order: AdminOrderRes) => {
    if (order.status === "PENDING") {
      return (
        <div className="flex flex-col items-end gap-2 mt-2">
          <button
            onClick={(e) => handleConfirmPayment(e, order.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 w-full rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <CheckCircle2 size={14} />
            Đã nhận CK
          </button>
          <button
            onClick={(e) => handleCancelOrder(e, order.id)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 w-full rounded-lg text-xs font-semibold bg-secondary text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors border border-border/50"
          >
            <XCircle size={14} />
            Huỷ đơn
          </button>
        </div>
      );
    }
    
    // Admin can also cancel active orders
    if (!["COMPLETED", "CANCELLED"].includes(order.status)) {
      return (
        <button
          onClick={(e) => handleCancelOrder(e, order.id)}
          className="mt-2 text-[10px] font-semibold text-red-500 hover:text-red-700 hover:underline transition-colors"
        >
          Huỷ đơn hàng
        </button>
      );
    }
    return null;
  };

  return (
    <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Quản lý Đơn hàng</h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={openFilterModal}
            className="relative flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-secondary/40 transition text-sm font-medium shadow-sm"
          >
            <Filter size={16} />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <OrderTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
        isAdmin={true}
      />

      {loading ? (
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
                  <div className="h-6 w-20 bg-secondary/30 rounded-lg" />
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
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">Không tìm thấy đơn hàng nào phù hợp.</p>
          {activeFilterCount > 0 && activeTab !== "pending" && (
            <button onClick={clearFilters} className="text-sm font-medium text-primary hover:underline">
              Xoá bộ lọc
            </button>
          )}
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
                  order.status === "PENDING" && "border-yellow-400 border-2 shadow-yellow-100",
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
                    <div className="text-right flex flex-col items-end">
                      <div className="text-xs text-muted-foreground mb-1">
                        <Clock size={12} className="inline mr-1" />
                        {formatDateTime(order.created_at)}
                      </div>
                      {order.status === "PENDING" && order.auto_cancel_at ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] bg-secondary/50 px-2 py-1 rounded-lg">
                          <span className="text-muted-foreground">Huỷ sau:</span>
                          <CountdownTimer targetTime={order.auto_cancel_at} className="text-[11px]" />
                        </div>
                      ) : (
                        <div className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary inline-block">
                          Staff: {order.handler?.name || "Chưa nhận"}
                        </div>
                      )}
                    </div>
                  </div>

                  {renderActionButtons(order)}

                  <button
                    onClick={() => toggle(order.id)}
                    className="w-full flex items-center justify-between text-sm text-foreground/80 hover:text-foreground bg-secondary/20 p-2 rounded-xl mt-2"
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
                    <span className="text-xs text-muted-foreground">Tổng tiền</span>
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

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilterModal(false)} />
          <div className="relative bg-card w-full sm:w-[400px] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Bộ lọc đơn hàng</h2>
              <button onClick={() => setShowFilterModal(false)} className="p-1 rounded-md hover:bg-secondary/40 text-muted-foreground">✕</button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tên Khách / SĐT</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Nhập tên hoặc SĐT..."
                    value={draftFilters.search}
                    onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                    className="w-full h-11 pl-9 pr-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Staff xử lý</label>
                <input
                  type="text"
                  placeholder="Tên nhân viên..."
                  value={draftFilters.staffName}
                  onChange={(e) => setDraftFilters({ ...draftFilters, staffName: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Thời gian (Ngày đặt)</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={draftFilters.startDate}
                    onChange={(e) => setDraftFilters({ ...draftFilters, startDate: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <input
                    type="date"
                    value={draftFilters.endDate}
                    onChange={(e) => setDraftFilters({ ...draftFilters, endDate: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={clearFilters} className="flex-1 h-11 rounded-xl border font-medium text-sm hover:bg-secondary/40 flex items-center justify-center gap-2">
                <FilterX size={16} /> Xoá lọc
              </button>
              <button onClick={applyFilters} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90">
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((s) => ({ ...s, isOpen: false }))}
      />
    </div>
  );
}
