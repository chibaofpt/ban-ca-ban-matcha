"use client";

import { useState } from "react";
import { Plus, Search, RefreshCw, FlaskConical } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PowderListItem from "@/src/components/admin/PowderListItem";
import PowderDrawer from "@/src/components/admin/PowderDrawer";
import {
  listAdminPowders,
} from "@/src/services/adminPowderService";
import { listAdminMenuItems } from "@/src/services/adminMenuService";
import type { Powder } from "@/src/lib/types/powder";
import { cn } from "@/src/utils/cn";

// ── Drawer state ───────────────────────────────────────────────────────────────

type DrawerState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; item: Powder };

/** Trang quản lý bột matcha — Admin. */
export default function AdminPowderPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "inactive">("active");
  const [drawerState, setDrawerState] = useState<DrawerState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const {
    data: powders = [],
    isLoading: isPowdersLoading,
    isFetching: isPowdersFetching,
    isError: isPowdersError,
    refetch: refetchPowders,
  } = useQuery({
    queryKey: ["admin", "powders"],
    queryFn: listAdminPowders,
  });

  const {
    data: menuData,
    isLoading: isMenuLoading,
    isFetching: isMenuFetching,
    isError: isMenuError,
    refetch: refetchMenu,
  } = useQuery({
    queryKey: ["admin", "menu"],
    queryFn: listAdminMenuItems,
  });

  const latteItems = menuData?.latte || [];
  const isLoading = isPowdersLoading || isMenuLoading;
  const isRefreshing = isPowdersFetching || isMenuFetching;
  const error =
    isPowdersError || isMenuError
      ? "Không thể tải danh sách bột. Vui lòng thử lại."
      : null;

  const loadData = () => {
    void Promise.all([refetchPowders(), refetchMenu()]);
  };

  // ── Toast ────────────────────────────────────────────────────────────────────

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filteredPowders = powders.filter((p) => {
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? p.is_available
        : !p.is_available;
    const matchesSearch =
      searchQuery.trim() === "" ||
      p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      (p.manufacturer ?? "").toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCreateSuccess = (newPowder: Powder) => {
    queryClient.setQueryData<Powder[]>(["admin", "powders"], (old) => [
      newPowder,
      ...(old || []),
    ]);
    showToast(`Đã thêm bột "${newPowder.name}"`);
  };

  const handleEditSuccess = (updatedPowder: Powder) => {
    queryClient.setQueryData<Powder[]>(["admin", "powders"], (old) =>
      old?.map((p) => (p.id === updatedPowder.id ? updatedPowder : p))
    );
    showToast(`Đã cập nhật bột "${updatedPowder.name}"`);
  };

  const handleDrawerSuccess = (item: Powder) => {
    if (drawerState.open && drawerState.mode === "edit") {
      handleEditSuccess(item);
    } else {
      handleCreateSuccess(item);
    }
  };

  const handleToggleSuccess = (id: string, next: boolean) => {
    queryClient.setQueryData<Powder[]>(["admin", "powders"], (old) =>
      old?.map((p) => (p.id === id ? { ...p, is_available: next } : p))
    );
    showToast(next ? "Đã mở bán bột" : "Đã ngừng bán bột");
  };

  // ── Stats ────────────────────────────────────────────────────────────────────

  const activeCount = powders.filter((p) => p.is_available).length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Bột Matcha</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {powders.length} loại bột · {activeCount} đang bán
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={isRefreshing ? "Đang tải lại" : "Tải lại"}
            onClick={loadData}
            disabled={isRefreshing}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-background text-muted-foreground shadow-sm transition hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setDrawerState({ open: true, mode: "create" })}
            className="flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Plus size={15} />
            Thêm bột
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:px-0">
        <div className="relative hidden min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Tìm tên bột, nhà sản xuất..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="contents">
          {(
              [
                { id: "all", label: "Tất cả" },
                { id: "active", label: "Đang bán" },
              { id: "inactive", label: "Ngừng bán" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              aria-pressed={statusFilter === f.id}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                statusFilter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm divide-y divide-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/40 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-secondary/40 animate-pulse rounded-full w-2/5" />
                <div className="h-2.5 bg-secondary/30 animate-pulse rounded-full w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Thử lại
          </button>
        </div>
      ) : filteredPowders.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground rounded-2xl border-2 border-dashed border-border/60 bg-secondary/10">
          <FlaskConical size={40} className="mb-3 opacity-40" strokeWidth={1.5} />
          <p className="text-sm">
            {searchQuery || statusFilter !== "active"
              ? "Không tìm thấy bột phù hợp."
              : "Chưa có bột nào. Bấm «Thêm bột» để bắt đầu."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm divide-y divide-border/50">
          {filteredPowders.map((item) => (
            <PowderListItem
              key={item.id}
              item={item}
              onClick={(p) => setDrawerState({ open: true, mode: "edit", item: p })}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <PowderDrawer
        open={drawerState.open}
        mode={drawerState.open ? drawerState.mode : "create"}
        item={drawerState.open && drawerState.mode === "edit" ? drawerState.item : undefined}
        latteItems={latteItems}
        onClose={() => setDrawerState({ open: false })}
        onSuccess={handleDrawerSuccess}
        onToggleSuccess={handleToggleSuccess}
      />

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition animate-in fade-in slide-in-from-bottom-2",
            toast.type === "success"
              ? "bg-primary text-primary-foreground"
              : "bg-destructive text-white"
          )}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
