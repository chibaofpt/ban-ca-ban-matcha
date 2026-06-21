"use client";

import { useState, useEffect, useCallback } from "react";
import { X, BarChart3, Loader2, RefreshCw, TrendingUp, Package, Award } from "lucide-react";
import { getStaffReport, getAdminReport, getStaffList } from "@/src/services/reportService";
import type { StaffReport, AdminReport, StaffMember } from "@/src/lib/types/report";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number as VND with thousand separator */
function formatVND(amount: number): string {
  return `${(amount / 1000).toLocaleString("vi-VN")}K ₫`;
}

/** Get today's date string as YYYY-MM-DD in local time */
function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DailyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: "STAFF" | "ADMIN";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-secondary/20">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b bg-secondary/20">
        <div className="h-4 w-32 bg-secondary/60 rounded" />
      </div>
      <div className="p-4 space-y-3">
        <div className="h-4 w-full bg-secondary/40 rounded" />
        <div className="h-4 w-3/4 bg-secondary/30 rounded" />
        <div className="h-4 w-1/2 bg-secondary/20 rounded" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";

/** Full-screen report modal for staff (summary only) and admin (full report) */
export function DailyReportModal({
  isOpen,
  onClose,
  userRole,
}: DailyReportModalProps) {
  useBodyScrollLock(isOpen);
  const today = getTodayStr();

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffReport, setStaffReport] = useState<StaffReport | null>(null);
  const [adminReport, setAdminReport] = useState<AdminReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch staff list once for admin
  useEffect(() => {
    if (!isOpen || userRole !== "ADMIN") return;
    getStaffList()
      .then(setStaffList)
      .catch(() => {
        // Non-critical — dropdown will just be empty
      });
  }, [isOpen, userRole]);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Vui lòng chọn ngày bắt đầu và kết thúc");
      return;
    }
    if (startDate > endDate) {
      toast.error("Ngày bắt đầu không được sau ngày kết thúc");
      return;
    }

    setIsLoading(true);
    try {
      if (userRole === "STAFF") {
        const data = await getStaffReport({ startDate, endDate });
        setStaffReport(data);
      } else {
        const data = await getAdminReport({
          startDate,
          endDate,
          staffId: selectedStaffId || undefined,
        });
        setAdminReport(data);
      }
      setHasFetched(true);
    } catch {
      toast.error("Không thể tải báo cáo. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedStaffId, userRole]);

  // Auto-fetch on open with default date (today)
  useEffect(() => {
    if (isOpen && !hasFetched) {
      fetchReport();
    }
  }, [isOpen, hasFetched, fetchReport]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStaffReport(null);
      setAdminReport(null);
      setHasFetched(false);
      setStartDate(today);
      setEndDate(today);
      setSelectedStaffId("");
    }
  }, [isOpen, today]);

  if (!isOpen) return null;

  const report = userRole === "STAFF" ? staffReport : adminReport;
  const isEmpty =
    hasFetched &&
    report &&
    (report as StaffReport).summary.total_orders === 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ---- Sticky Header ---- */}
      <div className="sticky top-0 z-10 bg-background border-b shadow-sm">
        <div className="flex items-center h-14 px-4 gap-3 max-w-3xl mx-auto w-full">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary/40 transition text-muted-foreground"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <BarChart3 size={18} className="text-primary" />
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Báo cáo
            </h2>
          </div>
        </div>

        {/* ---- Filter Bar ---- */}
        <div className="px-4 pb-4 max-w-3xl mx-auto w-full space-y-3">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Từ ngày
              </label>
              <input
                type="date"
                value={startDate}
                max={endDate || today}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Đến ngày
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>

          {/* Staff dropdown — admin only */}
          {userRole === "ADMIN" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Staff xử lý
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">Tất cả staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.role === "ADMIN" ? " (Admin)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Apply button */}
          <button
            onClick={fetchReport}
            disabled={isLoading}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Đang tải...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Xem báo cáo
              </>
            )}
          </button>
        </div>
      </div>

      {/* ---- Scrollable Content ---- */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 max-w-3xl mx-auto w-full space-y-4 pb-8">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            {userRole === "ADMIN" && (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
          </>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
            <BarChart3 size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">
              Không có dữ liệu trong khoảng thời gian này
            </p>
          </div>
        ) : report ? (
          <>
            {/* ===== STAFF VIEW: chỉ hiển thị tổng đơn + doanh thu ===== */}
            {userRole === "STAFF" && staffReport && (
              <SectionCard title="📊 Tổng quan">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-foreground">
                      {staffReport.summary.total_orders}
                    </p>
                    <p className="text-xs text-muted-foreground">Đơn hàng</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xl font-bold text-primary">
                      {formatVND(staffReport.summary.total_revenue_vnd)}
                    </p>
                    <p className="text-xs text-muted-foreground">Doanh thu</p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ===== ADMIN VIEW: full report ===== */}
            {userRole === "ADMIN" && adminReport && (
              <>
                {/* ---- Summary Card ---- */}
                <SectionCard title="📊 Tổng quan">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-foreground">
                        {adminReport.summary.total_orders}
                      </p>
                      <p className="text-xs text-muted-foreground">Đơn hàng</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-foreground">
                        {adminReport.summary.total_cups}
                      </p>
                      <p className="text-xs text-muted-foreground">Ly bán ra</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-bold text-primary">
                        {formatVND(adminReport.summary.total_revenue_vnd)}
                      </p>
                      <p className="text-xs text-muted-foreground">Doanh thu</p>
                    </div>
                  </div>
                </SectionCard>

                {/* ---- Revenue by Type ---- */}
                {adminReport.revenue_by_type.length > 0 && (
                  <SectionCard title="💰 Doanh thu theo phương thức">
                    <div className="grid grid-cols-1 gap-2">
                      {adminReport.revenue_by_type.map((r) => (
                        <div
                          key={r.order_type}
                          className="flex items-center justify-between py-2 border-b last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <TrendingUp size={14} className="text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">
                              {r.order_type === "COUNTER"
                                ? "Tại quầy"
                                : r.order_type === "PICKUP"
                                ? "Đặt trước"
                                : "Giao hàng"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({r.order_count} đơn)
                            </span>
                          </div>
                          <span className="text-sm font-bold text-foreground tabular-nums">
                            {formatVND(r.total_revenue_vnd)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* ---- Powder Usage ---- */}
                {adminReport.powder_usage.length > 0 && (
                  <SectionCard title="🍵 Bột Matcha đã dùng">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Loại bột</th>
                          <th className="text-right pb-2 font-medium">Tổng gram</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminReport.powder_usage.map((p) => (
                          <tr key={p.powder_name}>
                            <td className="py-2.5 font-medium text-foreground">
                              {p.powder_name}
                            </td>
                            <td className="py-2.5 text-right text-foreground tabular-nums">
                              {p.total_grams % 1 === 0
                                ? p.total_grams
                                : p.total_grams.toFixed(1)}
                              g
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* ---- Milk Usage ---- */}
                {adminReport.milk_usage.length > 0 && (
                  <SectionCard title="🥛 Sữa đã dùng">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Loại sữa</th>
                          <th className="text-right pb-2 font-medium">Tổng ml</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminReport.milk_usage.map((m) => (
                          <tr key={m.milk_name}>
                            <td className="py-2.5 font-medium text-foreground">
                              {m.milk_name}
                            </td>
                            <td className="py-2.5 text-right text-foreground tabular-nums">
                              {m.total_ml.toLocaleString("vi-VN")}ml
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* ---- Addon Usage ---- */}
                {adminReport.addon_usage.length > 0 && (
                  <SectionCard title="📦 Addon đã dùng">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Addon</th>
                          <th className="text-left pb-2 font-medium">Nhóm</th>
                          <th className="text-right pb-2 font-medium">Số lượt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminReport.addon_usage.map((a) => (
                          <tr key={a.addon_label}>
                            <td className="py-2.5 font-medium text-foreground pr-2">
                              {a.addon_label}
                            </td>
                            <td className="py-2.5 text-muted-foreground text-xs">
                              {a.group_name}
                            </td>
                            <td className="py-2.5 text-right font-bold text-foreground tabular-nums">
                              {a.total_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* ---- Latte Sales ---- */}
                {adminReport.latte_sales.length > 0 && (
                  <SectionCard title="☕ Latte — Số ly bán ra">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Món</th>
                          <th className="text-right pb-2 font-medium w-8">M</th>
                          <th className="text-right pb-2 font-medium w-8">L</th>
                          <th className="text-right pb-2 font-medium w-8">XL</th>
                          <th className="text-right pb-2 font-medium w-14">Tổng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminReport.latte_sales.map((item) => (
                          <tr key={item.name}>
                            <td className="py-2.5 font-medium text-foreground pr-2">
                              {item.name}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums w-8">
                              {item.sizes.M > 0 ? item.sizes.M : "—"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums w-8">
                              {item.sizes.L > 0 ? item.sizes.L : "—"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums w-8">
                              {item.sizes.XL > 0 ? item.sizes.XL : "—"}
                            </td>
                            <td className="py-2.5 text-right font-bold text-foreground tabular-nums w-14">
                              {item.total_cups}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* ---- Fusion Sales ---- */}
                {adminReport.fusion_sales.length > 0 && (
                  <SectionCard title="🥤 Fusion — Số ly bán ra">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium">Món</th>
                          <th className="text-right pb-2 font-medium w-8">M</th>
                          <th className="text-right pb-2 font-medium w-8">L</th>
                          <th className="text-right pb-2 font-medium w-8">XL</th>
                          <th className="text-right pb-2 font-medium w-14">Tổng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminReport.fusion_sales.map((item) => (
                          <tr key={item.name}>
                            <td className="py-2.5 font-medium text-foreground pr-2">
                              {item.name}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums w-8">
                              {item.sizes.M > 0 ? item.sizes.M : "—"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums w-8">
                              {item.sizes.L > 0 ? item.sizes.L : "—"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums w-8">
                              {item.sizes.XL > 0 ? item.sizes.XL : "—"}
                            </td>
                            <td className="py-2.5 text-right font-bold text-foreground tabular-nums w-14">
                              {item.total_cups}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* ---- Top Products ---- */}
                {adminReport.top_products.length > 0 && (
                  <SectionCard title="🏆 Top sản phẩm bán chạy">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 font-medium w-8">#</th>
                          <th className="text-left pb-2 font-medium">Sản phẩm</th>
                          <th className="text-left pb-2 font-medium">Loại</th>
                          <th className="text-right pb-2 font-medium w-16">Số ly</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adminReport.top_products.map((p, idx) => (
                          <tr key={p.name}>
                            <td className="py-2.5 text-muted-foreground text-xs w-8">
                              {idx === 0 ? (
                                <span className="text-yellow-500 font-bold">🥇</span>
                              ) : idx === 1 ? (
                                <span className="text-gray-400 font-bold">🥈</span>
                              ) : idx === 2 ? (
                                <span className="text-amber-600 font-bold">🥉</span>
                              ) : (
                                idx + 1
                              )}
                            </td>
                            <td className="py-2.5 font-medium text-foreground pr-2">
                              {p.name}
                            </td>
                            <td className="py-2.5 text-xs text-muted-foreground">
                              {p.category === "latte" ? "Latte" : "Fusion"}
                            </td>
                            <td className="py-2.5 text-right font-bold text-foreground tabular-nums w-16">
                              {p.total_cups}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* Show a note if no sales breakdown exists */}
                {adminReport.latte_sales.length === 0 && adminReport.fusion_sales.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    Chưa có dữ liệu bán hàng theo món.
                  </p>
                )}
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
