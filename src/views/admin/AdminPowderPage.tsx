"use client";

import { useState } from "react";
import { Plus, Search, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PowderCard from "@/src/components/admin/PowderCard";
import PowderModal from "@/src/components/admin/PowderModal";
import {
  listAdminPowders,
  togglePowderAvailability,
} from "@/src/services/adminPowderService";
import { listAdminMenuItems } from "@/src/services/adminMenuService";
import type { Powder } from "@/src/lib/types/powder";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; item: Powder };

export default function AdminPowderPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const {
    data: powders = [],
    isLoading: isPowdersLoading,
    isError: isPowdersError,
    refetch: refetchPowders,
  } = useQuery({
    queryKey: ["admin", "powders"],
    queryFn: listAdminPowders,
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

  const latteItems = menuData?.latte || [];
  const isLoading = isPowdersLoading || isMenuLoading;
  const error = (isPowdersError || isMenuError) ? "Không thể tải danh sách bột. Vui lòng thử lại." : null;

  const loadData = () => {
    refetchPowders();
    refetchMenu();
  };

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filteredPowders = powders.filter((p) => {
    const matchesType = typeFilter === "all" || p.type === typeFilter;
    const matchesSearch =
      searchQuery.trim() === "" ||
      p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleCreateSuccess = (newPowder: Powder) => {
    queryClient.setQueryData<Powder[]>(["admin", "powders"], (old) => [newPowder, ...(old || [])]);
    showToast(`Đã thêm bột "${newPowder.name}"`);
  };

  const handleEditSuccess = (updatedPowder: Powder) => {
    queryClient.setQueryData<Powder[]>(["admin", "powders"], (old) =>
      old?.map((p) => (p.id === updatedPowder.id ? updatedPowder : p))
    );
    showToast(`Đã cập nhật bột "${updatedPowder.name}"`);
  };

  const handleModalSuccess = (item: Powder) => {
    if (modalState.open && modalState.mode === "edit") {
      handleEditSuccess(item);
    } else {
      handleCreateSuccess(item);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      togglePowderAvailability(id, next),
    onMutate: async ({ id, next }) => {
      setTogglingId(id);
      await queryClient.cancelQueries({ queryKey: ["admin", "powders"] });
      const previousPowders = queryClient.getQueryData<Powder[]>(["admin", "powders"]);
      if (previousPowders) {
        queryClient.setQueryData<Powder[]>(["admin", "powders"], (old) =>
          old?.map((p) => (p.id === id ? { ...p, is_available: next } : p))
        );
      }
      return { previousPowders };
    },
    onError: (err, variables, context) => {
      if (context?.previousPowders) {
        queryClient.setQueryData(["admin", "powders"], context.previousPowders);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Bột Matcha</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {powders.length} loại bột · {powders.filter((p) => p.is_available).length} đang bán
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
            Thêm bột
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
            placeholder="Tìm tên bột..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden text-sm">
          {[
            { id: "all", label: "Tất cả" },
            { id: "NONE", label: "Không thẻ" },
            { id: "RECOMMEND", label: "Recommend" },
            { id: "NEW", label: "New" },
            { id: "SEASONAL", label: "Seasonal" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setTypeFilter(cat.id)}
              className={cn(
                "px-3 py-2 transition",
                typeFilter === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary/40"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-secondary/30 animate-pulse" />
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
        <div className="py-16 text-center text-muted-foreground text-sm">
          {searchQuery || typeFilter !== "all"
            ? "Không tìm thấy bột phù hợp."
            : "Chưa có bột nào. Bấm «Thêm bột» để bắt đầu."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredPowders.map((item) => (
            <div
              key={item.id}
              className={cn(togglingId === item.id && "pointer-events-none opacity-70")}
            >
              <PowderCard
                item={item}
                onClick={(i) => setModalState({ open: true, mode: "edit", item: i })}
                onToggleAvailable={handleToggleAvailable}
              />
            </div>
          ))}
        </div>
      )}

      {modalState.open && (
        <PowderModal
          mode={modalState.mode}
          item={modalState.mode === "edit" ? modalState.item : undefined}
          latteItems={latteItems}
          onClose={() => setModalState({ open: false })}
          onSuccess={handleModalSuccess}
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
