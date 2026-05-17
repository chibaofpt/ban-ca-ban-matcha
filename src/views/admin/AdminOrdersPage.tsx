"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Phone, Clock, Search, FilterX, Filter } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { fetchAdminOrders, type AdminOrderRes } from "@/src/services/adminOrderService";

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} • ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const StatusBadge = ({ status }: { status: AdminOrderRes["status"] }) => {
  const map: Record<AdminOrderRes["status"], { label: string; color: string }> = {
    PENDING: { label: "PENDING", color: "bg-yellow-100 text-yellow-800" },
    CONFIRMED: { label: "CONFIRMED", color: "bg-blue-100 text-blue-800" },
    READY: { label: "READY", color: "bg-green-100 text-green-800" },
    COMPLETED: { label: "COMPLETED", color: "bg-gray-100 text-gray-800" },
    CANCELLED: { label: "CANCELLED", color: "bg-red-100 text-red-800" },
  };
  const config = map[status] || map.PENDING;
  return (
    <span className={cn("shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase", config.color)}>
      {config.label}
    </span>
  );
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrderRes[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Helper to get today's date as YYYY-MM-DD in local timezone
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Modal State
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Active filters (applied to API)
  const [activeFilters, setActiveFilters] = useState({
    search: "",
    staffName: "",
    startDate: getTodayStr(), // Default to today
    endDate: "", // Until now
  });

  // Draft filters (while in modal)
  const [draftFilters, setDraftFilters] = useState(activeFilters);

  const loadData = async (filters = activeFilters) => {
    setLoading(true);
    try {
      // Correctly parse YYYY-MM-DD into local time 00:00:00 for start, and 23:59:59 for end
      const startIso = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).toISOString() : undefined;
      const endIso = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`).toISOString() : undefined;

      const data = await fetchAdminOrders({
        search: filters.search || undefined,
        staffName: filters.staffName || undefined,
        startDate: startIso,
        endDate: endIso,
      });
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const openFilterModal = () => {
    setDraftFilters(activeFilters);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setActiveFilters(draftFilters);
    setShowFilterModal(false);
    loadData(draftFilters);
  };

  const clearFilters = () => {
    const empty = { search: "", staffName: "", startDate: "", endDate: "" };
    setDraftFilters(empty);
    setActiveFilters(empty);
    setShowFilterModal(false);
    loadData(empty);
  };

  // Check if any filter is active for the badge
  const activeFilterCount = Object.values(activeFilters).filter((v) => v).length;

  return (
    <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Quản lý Đơn hàng</h1>
        <div className="flex gap-3 items-center">
          <span className="text-sm text-muted-foreground">{orders.length} kết quả</span>
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

      {loading && orders.length === 0 ? (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-secondary/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">Không tìm thấy đơn hàng nào phù hợp.</p>
          {activeFilterCount > 0 && (
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
                  order.status === "CANCELLED" && "opacity-60"
                )}
              >
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {order.user.name}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} />
                          {order.user.phone_number}
                        </span>
                        <span className="font-mono bg-secondary/50 px-1.5 rounded">
                          #{order.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-1">
                        <Clock size={12} className="inline mr-1" />
                        {formatDateTime(order.created_at)}
                      </div>
                      <div className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary inline-block">
                        Staff: {order.handler?.name || "Chưa nhận"}
                      </div>
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
                            {it.addons.length > 0 && (
                              <span className="text-[11px] text-muted-foreground mt-0.5">
                                {it.addons.map(a => `${a.addonOption.label} x${a.quantity}`).join(", ")}
                              </span>
                            )}
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
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowFilterModal(false)}
          />
          
          {/* Modal Content */}
          <div className="relative bg-card w-full sm:w-[400px] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Bộ lọc đơn hàng</h2>
              <button
                onClick={() => setShowFilterModal(false)}
                className="p-1 rounded-md hover:bg-secondary/40 text-muted-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer Search */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tên Khách / Số điện thoại</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Nhập tên hoặc SĐT..."
                    value={draftFilters.search}
                    onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                    className="w-full h-11 pl-9 pr-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              </div>

              {/* Staff Search */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Tên Nhân viên (Staff)</label>
                <input
                  type="text"
                  placeholder="Nhập tên nhân viên xử lý..."
                  value={draftFilters.staffName}
                  onChange={(e) => setDraftFilters({ ...draftFilters, staffName: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              {/* Date Range */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Khoảng thời gian (Ngày đặt)</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={draftFilters.startDate}
                    onChange={(e) => setDraftFilters({ ...draftFilters, startDate: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                  <input
                    type="date"
                    value={draftFilters.endDate}
                    onChange={(e) => setDraftFilters({ ...draftFilters, endDate: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={clearFilters}
                className="flex-1 h-11 rounded-xl border font-medium text-sm hover:bg-secondary/40 transition flex items-center justify-center gap-2"
              >
                <FilterX size={16} />
                Xoá lọc
              </button>
              <button
                onClick={applyFilters}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
