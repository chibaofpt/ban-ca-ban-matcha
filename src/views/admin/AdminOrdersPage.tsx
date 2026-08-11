"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Phone, Clock, Search, FilterX, Filter, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { formatKa, formatOrderSize } from "@/src/utils/display";
import { fetchAdminOrders, confirmPayment, adminCancelOrder, type AdminOrderRes } from "@/src/services/adminOrderService";
import { apiClient } from "@/src/lib/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OrderItemDetails } from "@/src/components/shared/OrderItemDetails";
import { PaymentMethodBadge } from "@/src/components/shared/PaymentMethodBadge";
import { resolveOrderPaymentMethod } from "@/src/lib/utils/counterTransferOrder";
import { OrderTabs, type OrderTabKey } from "@/src/components/staff/OrderTabs";
import { toast } from "sonner";
import { CountdownTimer } from "@/src/components/customer/CountdownTimer";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { OrderProgressBar } from "@/src/components/shared/OrderProgressBar";
import { DailyReportModal } from "@/src/components/report/DailyReportModal";

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

/** Chuyển order_type sang nhãn tiếng Việt thân thiện cho UI. */
const formatOrderType = (type: string): string => {
  if (type === "COUNTER") return "Tại quán";
  if (type === "PICKUP") return "Đặt trước";
  if (type === "DELIVERY") return "Giao hàng";
  return type;
};
void formatOrderType;

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<OrderTabKey>("counter");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    search: "",
    staffName: "",
    startDate: getTodayStr(),
    endDate: "",
  });
  const [draftFilters, setDraftFilters] = useState(activeFilters);

  const fetchOrdersFn = useCallback(async () => {
    const startIso = activeFilters.startDate ? new Date(`${activeFilters.startDate}T00:00:00`).toISOString() : undefined;
    const endIso = activeFilters.endDate ? new Date(`${activeFilters.endDate}T23:59:59.999`).toISOString() : undefined;

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

    return await fetchAdminOrders({
      search: activeFilters.search || undefined,
      staffName: activeFilters.staffName || undefined,
      startDate: activeTab !== "pending" ? startIso : undefined,
      endDate: activeTab !== "pending" ? endIso : undefined,
      order_type: orderTypeParam || undefined,
      status: statusParam || undefined,
      page,
      limit: 10,
    });
  }, [activeTab, activeFilters, page]);

  const { data: queryData, isLoading: isInitialLoading } = useQuery({
    queryKey: ["admin", "orders", { activeTab, activeFilters, page }],
    queryFn: fetchOrdersFn,
    refetchInterval: activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000,
  });

  const orders = queryData?.data || [];
  const totalPages = queryData?.meta.totalPages || 1;

  // Background polling cho pendingCount
  const fetchPendingCountAPI = useCallback(async () => {
    const res = await fetchAdminOrders({ status: "PENDING", limit: 1 });
    return res;
  }, []);

  const { data: pendingRes } = useQuery({
    queryKey: ["admin", "orders", "pending-count"],
    queryFn: fetchPendingCountAPI,
    refetchInterval: 20000,
  });

  const pendingCount = pendingRes?.meta.total || 0;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const openFilterModal = () => {
    setDraftFilters(activeFilters);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setPage(1);
    setActiveFilters(draftFilters);
    setShowFilterModal(false);
  };

  const clearFilters = () => {
    const defaultFilters = { search: "", staffName: "", startDate: getTodayStr(), endDate: "" };
    setDraftFilters(defaultFilters);
    setPage(1);
    setActiveFilters(defaultFilters);
    setShowFilterModal(false);
  };

  const activeFilterCount = 
    (activeFilters.search ? 1 : 0) +
    (activeFilters.staffName ? 1 : 0) +
    (activeFilters.startDate && activeFilters.startDate !== getTodayStr() ? 1 : 0) +
    (activeFilters.endDate ? 1 : 0);

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, newStatus }: { orderId: string; newStatus: string }) =>
      apiClient.patch(`/api/staff/orders/${orderId}`, { status: newStatus }),
    onSuccess: () => {
      toast.success("Cập nhật trạng thái thành công");
      refetch();
    },
    onError: (err: unknown) => {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Cập nhật thất bại");
      }
    },
  });

  const updateStatus = async (orderId: string, newStatus: string) => {
    updateStatusMutation.mutate({ orderId, newStatus });
  };

  const confirmPaymentMutation = useMutation({
    mutationFn: (order: AdminOrderRes) =>
      confirmPayment(order.id, order.order_type, order.payment_method),
    onSuccess: () => {
      toast.success("Xác nhận thanh toán thành công");
      refetch();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Xác nhận thất bại";
      toast.error(msg);
    },
  });

  const handleConfirmPayment = (e: React.MouseEvent, order: AdminOrderRes) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Xác nhận thanh toán",
      message: "Bạn có chắc chắn đã nhận được tiền chuyển khoản cho đơn này?",
      isDestructive: false,
      onConfirm: async () => {
        setConfirmModal((s) => ({ ...s, isOpen: false }));
        confirmPaymentMutation.mutate(order);
      },
    });
  };

  const cancelOrderMutation = useMutation({
    mutationFn: adminCancelOrder,
    onSuccess: () => {
      toast.success("Đã huỷ đơn hàng");
      refetch();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Huỷ thất bại";
      toast.error(msg);
    },
  });

  const handleCancelOrder = (e: React.MouseEvent, orderId: string, orderType: string, status: string) => {
    e.stopPropagation();
    const isCancellingCompleted = orderType === "COUNTER" && status === "COMPLETED";
    setConfirmModal({
      isOpen: true,
      title: "Huỷ đơn hàng",
      message: isCancellingCompleted
        ? "Đơn đã hoàn thành. Huỷ sẽ trừ lại điểm tích luỹ của khách. Bạn có chắc chắn không?"
        : "Bạn có chắc chắn muốn huỷ đơn hàng này?",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal((s) => ({ ...s, isOpen: false }));
        cancelOrderMutation.mutate(orderId);
      },
    });
  };

  const renderActionButtons = (order: AdminOrderRes) => {
    if (order.status === "PENDING") {
      return (
        <div className="flex flex-col items-end gap-2 mt-2">
          <button
            onClick={(e) => handleConfirmPayment(e, order)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 w-full rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <CheckCircle2 size={14} />
            Đã nhận CK
          </button>
        </div>
      );
    }
    
    if (order.status === "ADMIN_CONFIRMED") {
      return (
        <div className="flex flex-col items-end gap-2 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateStatus(order.id, "STAFF_DONE");
            }}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            Đã làm xong
          </button>
        </div>
      );
    }

    if (order.status === "STAFF_DONE") {
      return (
        <div className="flex flex-col items-end gap-2 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateStatus(order.id, "COMPLETED");
            }}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            Khách đã đến lấy
          </button>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="px-4 md:px-0 py-4 space-y-4 pb-24 md:pb-8 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Quản lý Đơn hàng</h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-secondary/40 transition text-sm font-medium shadow-sm"
          >
            <BarChart3 size={16} />
            Báo cáo
          </button>
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
        onTabChange={(tab) => {
          setPage(1);
          setActiveTab(tab);
        }}
        pendingCount={pendingCount}
        isAdmin={true}
      />

      {isInitialLoading ? (
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 mt-4">
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
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 mt-4">
          {orders.map((order) => {
            const isOpen = !!expanded[order.id];
            const isTerminal = order.status === "COMPLETED" || order.status === "CANCELLED";

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
                      <PaymentMethodBadge
                        method={resolveOrderPaymentMethod(order.order_type, order.payment_method)}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      <Clock size={12} className="inline mr-1" />
                      {formatDateTime(order.created_at)}
                    </div>
                  </div>

                  {/* Row 2: Tên khách + SĐT + Countdown */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-sm font-medium text-foreground">
                        {order.user?.name ?? "Khách vãng lai"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Phone size={11} />
                        {order.user?.phone_number ?? "—"}
                      </span>
                    </div>
                    {order.status === "PENDING" && order.auto_cancel_at && (
                      <div className="flex items-center gap-1 text-[11px] bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-lg text-yellow-700">
                        <Clock size={11} />
                        <CountdownTimer targetTime={order.auto_cancel_at} className="text-[11px]" />
                      </div>
                    )}
                  </div>

                  {/* Progress Bar — chỉ hiện cho non-terminal states */}
                  {!isTerminal && (
                    <div className="pt-1">
                      <OrderProgressBar status={order.status} />
                    </div>
                  )}

                  {/* Action buttons (Confirm Payment for PENDING) */}
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
                              <span className="font-normal text-muted-foreground">
                                {formatOrderSize(it.size)}
                              </span>
                            </span>
                            <OrderItemDetails item={it} />
                          </div>
                          <div className="flex flex-col items-end shrink-0 mt-0.5 gap-0.5">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {Math.round((it.unit_price_vnd + it.addons_price_vnd) / 1000).toLocaleString("vi-VN")}K
                            </span>
                            <span className="font-medium text-foreground tabular-nums">×{it.quantity}</span>
                          </div>
                        </li>
                      ))}
                      {order.discountVouchers && order.discountVouchers.length > 0 && (
                        <li className="text-xs text-green-600 pt-1 flex flex-col gap-0.5">
                          {order.discountVouchers.map((dv, idx) => {
                            const v = dv.voucher;
                            let discountText = "";
                            if (v.discount_type === "PERCENT") {
                              discountText = `Giảm ${v.discount_value}%`;
                            } else if (v.discount_type === "FIXED") {
                              discountText = `Giảm ${formatKa(v.discount_value!, "floor")}`;
                            }
                            return (
                              <span key={idx} className="font-medium">
                                • Voucher {v.package.name}: {discountText}
                              </span>
                            );
                          })}
                        </li>
                      )}
                    </ul>
                  )}

                  {/* Footer — total */}
                  <div className="border-t border-border pt-3 space-y-1.5">
                    <div className="flex justify-between items-center gap-2 text-[13px] text-muted-foreground">
                      <span>Tổng tiền:</span>
                      <span>{formatKa(order.subtotal_vnd, "ceil")}</span>
                    </div>
                    {order.shipping_fee_vnd > 0 && (
                      <div className="flex justify-between items-center gap-2 text-[13px] text-muted-foreground">
                        <span>Tiền ship:</span>
                        <span>{formatKa(order.shipping_fee_vnd, "ceil")}</span>
                      </div>
                    )}
                    {(() => {
                      const itemDiscount = order.items.reduce(
                        (sum, item) => sum + (item.total_discount_vnd || 0),
                        0
                      );
                      const totalDiscount = (order.total_voucher_discount_vnd || 0) + (order.freeship_discount_vnd || 0) + itemDiscount;
                      if (totalDiscount <= 0) return null;
                      return (
                        <div className="flex justify-between items-center gap-2 text-[13px] text-green-600">
                          <span>Voucher giảm:</span>
                          <span>-{formatKa(totalDiscount, "floor")}</span>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between items-center gap-2 pt-1.5 border-t border-border/50">
                      <span className="text-sm font-medium">Tiền khách trả:</span>
                      <span className="font-bold text-primary text-base">
                        {formatKa(order.grand_total_vnd || order.total_vnd, "ceil")}
                      </span>
                    </div>
                    {/* Footer row: cancel (left) + staff name (right) OR status text */}
                    {(() => {
                      // Admin can cancel:
                      // - COUNTER + COMPLETED (staff mistake / customer changed mind)
                      // - PICKUP/DELIVERY + any status except COMPLETED and CANCELLED
                      const canCancel =
                        (order.order_type === "COUNTER" && order.status === "COMPLETED") ||
                        (order.order_type !== "COUNTER" &&
                          order.status !== "COMPLETED" &&
                          order.status !== "CANCELLED");

                      return (
                        <div className="flex items-center justify-between mt-1.5">
                          {order.status === "CANCELLED" ? (
                            <span className="text-xs font-semibold flex items-center gap-1 text-red-500">
                              <XCircle size={13} className="text-red-500" />
                              <span>Đã huỷ</span>
                            </span>
                          ) : order.status === "COMPLETED" && order.order_type !== "COUNTER" ? (
                            <span className="text-xs font-semibold flex items-center gap-1 text-primary">
                              <CheckCircle2 size={13} className="text-primary" />
                              <span>Đã hoàn thành</span>
                            </span>
                          ) : canCancel ? (
                            <button
                              onClick={(e) => handleCancelOrder(e, order.id, order.order_type, order.status)}
                              className="text-[11px] font-semibold text-red-500 hover:text-red-700 hover:underline transition-colors"
                            >
                              Huỷ đơn
                            </button>
                          ) : (
                            <span className="text-xs font-semibold flex items-center gap-1 text-primary">
                              <CheckCircle2 size={13} className="text-primary" />
                              <span>Đã hoàn thành</span>
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            Staff: {order.handler?.name ?? "Chưa nhận"}
                          </span>
                        </div>
                      );
                    })()}
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
      {/* Report Modal */}
      <DailyReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userRole="ADMIN"
      />
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
