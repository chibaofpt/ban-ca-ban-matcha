"use client";

import { useState } from "react";
import { Plus, Search, RefreshCw, LayoutGrid, List, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/src/utils/cn";
import Image from "next/image";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";

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
  const [categoryFilter, setCategoryFilter] = useState<"all" | "latte" | "fusion" | "extras">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMenuItem | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const {
    data: menuData,
    isLoading: isMenuLoading,
    isError: isMenuError,
    refetch: refetchMenu,
  } = useQuery({
    queryKey: ["admin", "menu"],
    queryFn: listAdminMenuItems,
  });

  const {
    data: powders = [],
    isLoading: isPowdersLoading,
    isError: isPowdersError,
    refetch: refetchPowders,
  } = useQuery({
    queryKey: ["admin", "powders"],
    queryFn: listAdminPowders,
  });

  const isLoading = isMenuLoading || isPowdersLoading;
  const error = (isMenuError || isPowdersError) ? "Không thể tải danh sách món. Vui lòng thử lại." : null;

  const loadData = () => {
    refetchMenu();
    refetchPowders();
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
      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      // Đang bán (true) lên trước ngưng bán (false)
      if (a.is_available === b.is_available) return 0;
      return a.is_available ? -1 : 1;
    });

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMenuItem(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<AdminMenuData>(["admin", "menu"], (old) => {
        if (!old) return old;
        const remove = (items: AdminMenuItem[]) => items.filter((item) => item.id !== id);
        return {
          ...old,
          latte: remove(old.latte),
          fusion: remove(old.fusion),
          extras: remove(old.extras ?? []),
        };
      });
      setDeleteTarget(null);
      showToast("Đã ẩn món khỏi menu");
    },
    onError: () => {
      setDeleteTarget(null);
      showToast("Không thể xoá món. Vui lòng thử lại.", "error");
    },
  });

  const handleDeleteClick = (event: React.MouseEvent, item: AdminMenuItem) => {
    event.stopPropagation();
    setDeleteTarget(item);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">Sản phẩm</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {allItems.length} món · {allItems.filter((i) => i.is_available).length} đang bán
          </p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="flex bg-secondary/30 rounded-lg sm:rounded-xl p-0.5 sm:p-1 border border-border/50">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1 sm:p-1.5 rounded-md sm:rounded-lg transition-colors",
                viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "p-1 sm:p-1.5 rounded-md sm:rounded-lg transition-colors",
                viewMode === "table" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
          <button
            type="button"
            aria-label="Làm mới"
            onClick={loadData}
            className="rounded-lg sm:rounded-xl p-1.5 sm:p-2 sm:px-3 hover:bg-secondary/60 transition border border-border/50 bg-background text-muted-foreground hover:text-foreground shadow-sm flex items-center justify-center h-7 w-7 sm:h-auto sm:w-auto"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => setModalState({ open: true, mode: "create" })}
            className="flex items-center justify-center gap-1.5 rounded-lg sm:rounded-xl bg-primary text-primary-foreground h-7 w-7 sm:h-auto sm:w-auto sm:px-4 sm:py-2 text-sm font-medium hover:bg-primary/90 transition shadow-sm shadow-primary/20"
          >
            <Plus className="w-4 h-4 sm:w-[15px] sm:h-[15px]" />
            <span className="hidden sm:inline">Thêm món</span>
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
                  <th className="px-6 py-4 font-semibold tracking-wider text-center">Xoá</th>
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
                      <td className="px-6 py-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => handleDeleteClick(event, item)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-destructive transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                          aria-label={`Xoá ${item.name}`}
                          title="Xoá món"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
              <button
                type="button"
                onClick={(event) => handleDeleteClick(event, item)}
                className="absolute left-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-background/90 text-destructive shadow-sm backdrop-blur-sm transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                aria-label={`Xoá ${item.name}`}
                title="Xoá món"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Xoá món?"
        message={deleteTarget ? `Món “${deleteTarget.name}” sẽ bị ẩn khỏi menu và không thể đặt thêm.` : ""}
        confirmLabel="Xoá món"
        isDestructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

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
