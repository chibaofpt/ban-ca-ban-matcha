"use client";

import { useState } from "react";
import { Plus, Search, RefreshCw, Milk } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MilkTypeCard from "@/src/components/admin/MilkTypeCard";
import MilkTypeModal from "@/src/components/admin/MilkTypeModal";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import {
  listAdminMilkTypes,
  toggleMilkTypeActive,
  deleteMilkType,
  reorderMilkType,
} from "@/src/services/adminMilkTypeService";
import type { AdminMilkType } from "@/src/lib/types/milkType";
import { cn } from "@/src/utils/cn";
import { listAdminMenuItems } from "@/src/services/adminMenuService";

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; item: AdminMilkType };

export default function AdminMilkTypesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("active");
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<AdminMilkType | null>(null);

  const {
    data: milkTypes = [],
    isLoading: isMilkTypesLoading,
    isError: isMilkTypesError,
    refetch: refetchMilkTypes,
  } = useQuery({
    queryKey: ["admin", "milk-types"],
    queryFn: listAdminMilkTypes,
  });
  const {
    data: menuData,
    isLoading: isMenuLoading,
    isError: isMenuError,
    refetch: refetchMenu,
  } = useQuery({
    queryKey: ["admin", "menu"],
    queryFn: listAdminMenuItems,
  });
  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion] : [];
  const isLoading = isMilkTypesLoading || isMenuLoading;
  const isError = isMilkTypesError || isMenuError;

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filteredItems = milkTypes.filter((p) => {
    const matchesFilter =
      typeFilter === "all"
        ? true
        : typeFilter === "active"
        ? p.is_active
        : !p.is_active;
    const matchesSearch =
      searchQuery.trim() === "" ||
      p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleCreateSuccess = (newItem: AdminMilkType) => {
    queryClient.invalidateQueries({ queryKey: ["admin", "milk-types"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "menu"] });
    showToast(`Đã thêm loại sữa "${newItem.name}"`);
  };

  const handleEditSuccess = (updatedItem: AdminMilkType) => {
    queryClient.invalidateQueries({ queryKey: ["admin", "milk-types"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "menu"] });
    showToast(`Đã cập nhật loại sữa "${updatedItem.name}"`);
  };

  const handleModalSuccess = (item: AdminMilkType) => {
    if (modalState.open && modalState.mode === "edit") {
      handleEditSuccess(item);
    } else {
      handleCreateSuccess(item);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      toggleMilkTypeActive(id, next),
    onMutate: async ({ id, next }) => {
      setTogglingId(id);
      await queryClient.cancelQueries({ queryKey: ["admin", "milk-types"] });
      const previous = queryClient.getQueryData<AdminMilkType[]>(["admin", "milk-types"]);
      if (previous) {
        queryClient.setQueryData<AdminMilkType[]>(["admin", "milk-types"], (old) =>
          old?.map((p) => (p.id === id ? { ...p, is_active: next } : p))
        );
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "milk-types"], context.previous);
      }
      showToast("Không thể thay đổi trạng thái. Vui lòng thử lại.", "error");
    },
    onSettled: () => {
      setTogglingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMilkType(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<AdminMilkType[]>(["admin", "milk-types"], (old) =>
        old?.map((p) => (p.id === id ? { ...p, is_active: false } : p))
      );
      showToast("Đã ẩn loại sữa thành công");
      setDeletingItem(null);
    },
    onError: () => {
      showToast("Không thể xóa loại sữa này.", "error");
      setDeletingItem(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({
      currentId,
      currentOrder,
      swapId,
      swapOrder,
    }: {
      currentId: string;
      currentOrder: number;
      swapId: string;
      swapOrder: number;
    }) => {
      await Promise.all([
        reorderMilkType(currentId, swapOrder),
        reorderMilkType(swapId, currentOrder),
      ]);
    },
    onMutate: async ({ currentId, currentOrder, swapId, swapOrder }) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "milk-types"] });
      const previous = queryClient.getQueryData<AdminMilkType[]>(["admin", "milk-types"]);
      if (previous) {
        queryClient.setQueryData<AdminMilkType[]>(["admin", "milk-types"], (old) => {
          if (!old) return old;
          const newList = [...old];
          const currIdx = newList.findIndex((x) => x.id === currentId);
          const swapIdx = newList.findIndex((x) => x.id === swapId);
          if (currIdx > -1 && swapIdx > -1) {
            newList[currIdx] = { ...newList[currIdx], display_order: swapOrder };
            newList[swapIdx] = { ...newList[swapIdx], display_order: currentOrder };
            newList.sort((a, b) => a.display_order - b.display_order);
          }
          return newList;
        });
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "milk-types"], context.previous);
      }
      showToast("Không thể thay đổi thứ tự", "error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "milk-types"] });
    },
  });

  const handleReorder = (id: string, direction: "up" | "down") => {
    // Reorder works only within the currently filtered list
    const currentIndex = filteredItems.findIndex((item) => item.id === id);
    if (currentIndex === -1) return;
    
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= filteredItems.length) return;
    
    const currentItem = filteredItems[currentIndex];
    const swapItem = filteredItems[swapIndex];
    
    reorderMutation.mutate({
      currentId: currentItem.id,
      currentOrder: currentItem.display_order,
      swapId: swapItem.id,
      swapOrder: swapItem.display_order,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Base Liquid</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {milkTypes.length} loại · {milkTypes.filter((p) => p.is_active).length} đang dùng
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Làm mới"
            onClick={() => {
              void refetchMilkTypes();
              void refetchMenu();
            }}
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
            Thêm Base Liquid
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Tìm Base Liquid..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden text-sm">
          {[
            { id: "active", label: "Đang bán" },
            { id: "all", label: "Tất cả" },
            { id: "inactive", label: "Đã ẩn" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setTypeFilter(cat.id)}
              className={cn(
                "px-3 py-2 transition",
                typeFilter === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-secondary/30 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
          <p className="text-sm text-destructive">Không thể tải danh sách. Vui lòng thử lại.</p>
          <button
            type="button"
            onClick={() => {
              void refetchMilkTypes();
              void refetchMenu();
            }}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Thử lại
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
          <Milk size={48} className="mb-4 opacity-50" strokeWidth={1.5} />
          <p className="text-sm">
            {searchQuery || typeFilter !== "active"
              ? "Không tìm thấy loại sữa phù hợp."
              : "Chưa có loại sữa nào. Bấm «Thêm loại sữa» để bắt đầu."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.map((item, idx) => (
            <div
              key={item.id}
              className={cn(togglingId === item.id && "pointer-events-none opacity-70")}
            >
              <MilkTypeCard
                item={item}
                isFirst={idx === 0}
                isLast={idx === filteredItems.length - 1}
                onClick={(i) => setModalState({ open: true, mode: "edit", item: i })}
                onToggleActive={(id, next) => toggleMutation.mutate({ id, next })}
                onDelete={(i) => setDeletingItem(i)}
                onReorder={handleReorder}
              />
            </div>
          ))}
        </div>
      )}

      {modalState.open && (
        <MilkTypeModal
          mode={modalState.mode}
          item={modalState.mode === "edit" ? modalState.item : undefined}
          menuItems={menuItems}
          onClose={() => setModalState({ open: false })}
          onSuccess={handleModalSuccess}
        />
      )}

      {deletingItem && (
        <ConfirmModal
          isOpen={!!deletingItem}
          title="Ẩn loại sữa"
          message={`Bạn có chắc muốn ẩn sữa "${deletingItem.name}"? Bạn có thể khôi phục sau này trong tab "Đã ẩn".`}
          confirmLabel="Ẩn sữa"
          isDestructive={true}
          onConfirm={() => deleteMutation.mutate(deletingItem.id)}
          onCancel={() => setDeletingItem(null)}
        />
      )}

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
