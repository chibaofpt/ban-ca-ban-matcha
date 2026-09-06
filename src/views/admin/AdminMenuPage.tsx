"use client";

import { useState } from "react";
import { Plus, Search, RefreshCw, LayoutGrid, List } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MenuItemCard from "@/src/components/admin/MenuItemCard";
import MenuItemModal from "@/src/components/admin/MenuItemModal";
import {
  listAdminMenuItems,
  toggleMenuItemAvailability,
  type AdminMenuData,
} from "@/src/services/adminMenuService";
import { listAdminPowders } from "@/src/services/adminPowderService";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";
import Image from "next/image";

// ── Modal state ───────────────────────────────────────────────────────────────

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; item: AdminMenuItem };

// ── Main page ─────────────────────────────────────────────────────────────────

/** Trang quản lý menu — Admin. */
export default function AdminMenuPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "latte" | "fusion" | "extras" | "unavailable">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

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

  const isLoading = isMenuLoading || isPowdersLoading;
  const isRefreshing = isMenuFetching || isPowdersFetching;
  const error = (isMenuError || isPowdersError) ? "Không thể tải danh sách món. Vui lòng thử lại." : null;

  const loadData = () => {
    void Promise.all([refetchMenu(), refetchPowders()]);
  };

  // ── Data fetching ───────────────────────────────────────────────────────────

  // (already handled by TQ)

  // ── Toast helper ────────────────────────────────────────────────────────────

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── All items (flat for filtering) ─────────────────────────────────────────

  const allItems: AdminMenuItem[] = menuData
    ? [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])]
    : [];

  const filteredItems = allItems
    .filter((item) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());

      if (!matchesSearch) return false;

      switch (categoryFilter) {
        case "unavailable":
          return !item.is_available;
        case "latte":
          return item.category === "latte" && item.is_available;
        case "fusion":
          return item.category === "fusion" && item.is_available;
        case "extras":
          return item.category === "extras" && item.is_available;
        case "all":
        default:
          return item.is_available;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCreateSuccess = (newItem: AdminMenuItem, powderName?: string) => {
    queryClient.setQueryData<AdminMenuData>(["admin", "menu"], (old) => {
      if (!old) return old;
      const list = newItem.category === "latte" ? old.latte : newItem.category === "fusion" ? old.fusion : (old.extras ?? []);
      return {
        ...old,
        [newItem.category]: [...list, newItem],
      };
    });
    if (powderName) {
      showToast(`Đã tạo món "${newItem.name}" và bột "${powderName}"`);
    } else {
      showToast(`Đã thêm món "${newItem.name}"`);
    }
  };

  const handleEditSuccess = (updatedItem: AdminMenuItem) => {
    queryClient.setQueryData<AdminMenuData>(["admin", "menu"], (old) => {
      if (!old) return old;
      const updateList = (list: AdminMenuItem[]) =>
        list.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      return {
        ...old,
        latte: updateList(old.latte),
        fusion: updateList(old.fusion),
        extras: updateList(old.extras ?? []),
      };
    });
    showToast(`Đã cập nhật món "${updatedItem.name}"`);
  };

  const handleModalSuccess = (item: AdminMenuItem, powderName?: string) => {
    if (modalState.open && modalState.mode === "edit") {
      handleEditSuccess(item);
    } else {
      handleCreateSuccess(item, powderName);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      toggleMenuItemAvailability(id, next),
    onMutate: async ({ id, next }) => {
      setTogglingId(id);
      await queryClient.cancelQueries({ queryKey: ["admin", "menu"] });
      const previousMenu = queryClient.getQueryData<AdminMenuData>(["admin", "menu"]);
      if (previousMenu) {
        queryClient.setQueryData<AdminMenuData>(["admin", "menu"], (old) => {
          if (!old) return old;
          const toggle = (list: AdminMenuItem[]) =>
            list.map((i) => (i.id === id ? { ...i, is_available: next } : i));
          return { ...old, latte: toggle(old.latte), fusion: toggle(old.fusion), extras: toggle(old.extras ?? []) };
        });
      }
      return { previousMenu };
    },
    onError: (err, variables, context) => {
      if (context?.previousMenu) {
        queryClient.setQueryData(["admin", "menu"], context.previousMenu);
      }
      showToast("Không thể thay đổi trạng thái. Vui lòng thử lại.", "error");
    },
    onSettled: () => {
      setTogglingId(null);
    },
  });

  const handleToggleAvailable = async (id: string, next: boolean) => {
    toggleMutation.mutate({ id, next });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">Sản phẩm</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {allItems.length} món · {allItems.filter((i) => i.is_available).length} đang bán
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-xl border border-border/50 bg-secondary/30 p-1">
            <button
              type="button"
              aria-label="Hiển thị dạng lưới"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Hiển thị dạng danh sách"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                viewMode === "table" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
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
            onClick={() => setModalState({ open: true, mode: "create" })}
            className="flex h-10 w-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto sm:px-4"
          >
            <Plus className="w-4 h-4 sm:w-[15px] sm:h-[15px]" />
            <span className="hidden sm:inline">Thêm món</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:px-0">
        <div className="relative hidden min-w-[200px] flex-1">
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
        <div className="contents">
          {(["all", "latte", "fusion", "extras", "unavailable"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              aria-pressed={categoryFilter === cat}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                categoryFilter === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary/40"
              )}
            >
              {cat === "all" ? "Tất cả" : cat === "unavailable" ? "Ngừng bán" : cat}
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
        <div className="py-16 text-center text-muted-foreground text-sm border-2 border-dashed border-border/60 rounded-2xl bg-secondary/10">
          {searchQuery || categoryFilter !== "all"
            ? "Không tìm thấy món phù hợp."
            : "Chưa có món nào. Bấm «Thêm món» để bắt đầu."}
        </div>
      ) : viewMode === "table" ? (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/30 text-xs uppercase text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-semibold tracking-wider">Món</th>
                  <th className="px-6 py-4 font-semibold tracking-wider">Danh mục</th>
                  <th className="px-6 py-4 font-semibold tracking-wider text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredItems.map((item) => {
                  const activeSizes = item.sizes.filter((s) => s.base_price_vnd != null);
                  const minPriceCa = activeSizes.length > 0
                    ? Math.min(...activeSizes.map((s) => Math.floor(s.base_price_vnd! / 1000)))
                        : null;
                      void minPriceCa;
                  
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setModalState({ open: true, mode: "edit", item })}
                      className={cn(
                        "hover:bg-secondary/20 transition-colors cursor-pointer",
                        !item.is_available && "bg-secondary/5 opacity-70",
                        togglingId === item.id && "pointer-events-none opacity-50"
                      )}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {item.image_url ? (
                              <Image src={item.image_url} alt={item.name} width={40} height={40} sizes="40px" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xl">🍵</span>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{item.name}</div>
                            {item.is_seasonal && (
                              <span className="inline-block mt-0.5 rounded-full bg-amber-500/20 text-amber-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                Mùa vụ
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border",
                            item.category === "latte"
                              ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/20"
                              : "bg-violet-500/10 text-violet-800 border-violet-500/20"
                          )}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={item.is_available}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAvailable(item.id, !item.is_available);
                            }}
                            className={cn(
                              "relative inline-flex h-5 w-9 rounded-full transition-colors duration-200",
                              item.is_available ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                          >
                            <span
                              className={cn(
                                "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 m-0.5",
                                item.is_available ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn("relative", togglingId === item.id && "pointer-events-none opacity-50")}
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
          baseLiquids={menuData?.base_liquids ?? []}
          defaultSizeConfig={menuData?.default_size_config ?? []}
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
