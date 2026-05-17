"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, RefreshCw } from "lucide-react";
import MenuItemCard from "@/src/components/admin/MenuItemCard";
import MenuItemModal from "@/src/components/admin/MenuItemModal";
import {
  listAdminMenuItems,
  deleteMenuItem,
  toggleMenuItemAvailability,
  type AdminMenuData,
} from "@/src/services/adminMenuService";
import { listAdminPowders } from "@/src/services/adminPowderService";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import { cn } from "@/src/utils/cn";

// ── Modal state ───────────────────────────────────────────────────────────────

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; item: AdminMenuItem };

// ── Confirm dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function ConfirmDialog({ message, onConfirm, onCancel, isLoading }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
        <p className="text-sm text-foreground">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-secondary/40 transition disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-sm bg-destructive text-white hover:bg-destructive/90 transition disabled:opacity-50"
          >
            {isLoading ? "Đang xử lý..." : "Tiếp tục"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

/** Trang quản lý menu — Admin. */
export default function AdminMenuPage() {
  const [menuData, setMenuData] = useState<AdminMenuData | null>(null);
  const [powders, setPowders] = useState<Powder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "latte" | "fusion">("all");
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [menu, powderRes] = await Promise.all([
        listAdminMenuItems(),
        listAdminPowders(),
      ]);
      setMenuData(menu);
      setPowders(powderRes);
    } catch {
      setError("Không thể tải danh sách món. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Toast helper ────────────────────────────────────────────────────────────

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── All items (flat for filtering) ─────────────────────────────────────────

  const allItems: AdminMenuItem[] = menuData
    ? [...menuData.latte, ...menuData.fusion]
    : [];

  const filteredItems = allItems.filter((item) => {
    const matchesCategory =
      categoryFilter === "all" || item.category === categoryFilter;
    const matchesSearch =
      searchQuery.trim() === "" ||
      item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCreateSuccess = (newItem: AdminMenuItem) => {
    setMenuData((prev) => {
      if (!prev) return prev;
      const list = newItem.category === "latte" ? prev.latte : prev.fusion;
      return {
        ...prev,
        [newItem.category]: [...list, newItem],
      };
    });
    showToast(`Đã thêm món "${newItem.name}"`);
    loadData(); // Re-fetch to sync fully with DB
  };

  const handleEditSuccess = (updatedItem: AdminMenuItem) => {
    setMenuData((prev) => {
      if (!prev) return prev;
      const updateList = (list: AdminMenuItem[]) =>
        list.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      return {
        ...prev,
        latte: updateList(prev.latte),
        fusion: updateList(prev.fusion),
      };
    });
    showToast(`Đã cập nhật món "${updatedItem.name}"`);
    loadData(); // Re-fetch to sync fully with DB
  };

  const handleModalSuccess = (item: AdminMenuItem) => {
    if (modalState.open && modalState.mode === "edit") {
      handleEditSuccess(item);
    } else {
      handleCreateSuccess(item);
    }
  };

  const handleToggleAvailable = async (id: string, next: boolean) => {
    setTogglingId(id);
    // Optimistic update
    const rollback = menuData;
    setMenuData((prev) => {
      if (!prev) return prev;
      const toggle = (list: AdminMenuItem[]) =>
        list.map((i) => (i.id === id ? { ...i, is_available: next } : i));
      return { ...prev, latte: toggle(prev.latte), fusion: toggle(prev.fusion) };
    });
    try {
      await toggleMenuItemAvailability(id, next);
      await loadData(); // Re-fetch to sync fully with DB
    } catch {
      setMenuData(rollback);
      showToast("Không thể thay đổi trạng thái. Vui lòng thử lại.", "error");
    } finally {
      setTogglingId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sản phẩm</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allItems.length} món · {allItems.filter((i) => i.is_available).length} đang bán
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Làm mới"
            onClick={loadData}
            className="rounded-xl p-2 hover:bg-secondary/60 transition text-muted-foreground"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={() => setModalState({ open: true, mode: "create" })}
            className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus size={15} />
            Thêm món
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Tìm tên món..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden text-sm">
          {(["all", "latte", "fusion"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "px-3 py-2 transition",
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary/40"
              )}
            >
              {cat === "all" ? "Tất cả" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-secondary/30 animate-pulse" />
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
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          {searchQuery || categoryFilter !== "all"
            ? "Không tìm thấy món phù hợp."
            : "Chưa có món nào. Bấm «Thêm món» để bắt đầu."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(togglingId === item.id && "pointer-events-none opacity-70")}
            >
              <MenuItemCard
                item={item}
                onClick={(i) => setModalState({ open: true, mode: "edit", item: i })}
                onToggleAvailable={handleToggleAvailable}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalState.open && (
        <MenuItemModal
          mode={modalState.mode}
          item={modalState.mode === "edit" ? modalState.item : undefined}
          powders={powders}
          onClose={() => setModalState({ open: false })}
          onSuccess={handleModalSuccess}
        />
      )}

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
