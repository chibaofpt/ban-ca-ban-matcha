"use client";

import { useState } from "react";
import { Plus, Search, RefreshCw, Layers } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AddonGroupCard from "@/src/components/admin/AddonGroupCard";
import AddonGroupModal from "@/src/components/admin/AddonGroupModal";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import {
  listAdminAddonGroups,
  toggleAddonGroupActive,
  deleteAddonGroup,
} from "@/src/services/adminAddonService";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { cn } from "@/src/utils/cn";

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; item: AdminAddonGroup };

export default function AdminAddonsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("active");
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<AdminAddonGroup | null>(null);

  const {
    data: groups = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin", "addon-groups"],
    queryFn: listAdminAddonGroups,
  });

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filteredItems = groups.filter((p) => {
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

  const handleModalSuccess = (item: AdminAddonGroup) => {
    queryClient.invalidateQueries({ queryKey: ["admin", "addon-groups"] });
    showToast(
      modalState.open && modalState.mode === "edit"
        ? `Đã cập nhật nhóm "${item.name}"`
        : `Đã thêm nhóm "${item.name}"`
    );
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      toggleAddonGroupActive(id, next),
    onMutate: async ({ id, next }) => {
      setTogglingId(id);
      await queryClient.cancelQueries({ queryKey: ["admin", "addon-groups"] });
      const previous = queryClient.getQueryData<AdminAddonGroup[]>(["admin", "addon-groups"]);
      if (previous) {
        queryClient.setQueryData<AdminAddonGroup[]>(["admin", "addon-groups"], (old) =>
          old?.map((p) => (p.id === id ? { ...p, is_active: next } : p))
        );
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "addon-groups"], context.previous);
      }
      showToast("Không thể thay đổi trạng thái. Vui lòng thử lại.", "error");
    },
    onSettled: () => {
      setTogglingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAddonGroup(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<AdminAddonGroup[]>(["admin", "addon-groups"], (old) =>
        old?.map((p) => (p.id === id ? { ...p, is_active: false } : p))
      );
      showToast("Đã ẩn nhóm addon thành công");
      setDeletingItem(null);
    },
    onError: () => {
      showToast("Không thể xóa nhóm addon này.", "error");
      setDeletingItem(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Addon Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {groups.length} nhóm · {groups.filter((p) => p.is_active).length} đang hoạt động
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Làm mới"
            onClick={() => refetch()}
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
            Thêm nhóm
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
            placeholder="Tìm tên nhóm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden text-sm">
          {[
            { id: "active", label: "Đang hoạt động" },
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
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-secondary/30 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center">
          <p className="text-sm text-destructive">Không thể tải danh sách. Vui lòng thử lại.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Thử lại
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
          <Layers size={48} className="mb-4 opacity-50" strokeWidth={1.5} />
          <p className="text-sm">
            {searchQuery || typeFilter !== "active"
              ? "Không tìm thấy nhóm addon phù hợp."
              : "Chưa có nhóm addon nào. Bấm «Thêm nhóm» để bắt đầu."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(togglingId === item.id && "pointer-events-none opacity-70")}
            >
              <AddonGroupCard
                item={item}
                onEdit={(i) => setModalState({ open: true, mode: "edit", item: i })}
                onToggleActive={(id, next) => toggleMutation.mutate({ id, next })}
                onDelete={(i) => setDeletingItem(i)}
              />
            </div>
          ))}
        </div>
      )}

      {modalState.open && (
        <AddonGroupModal
          mode={modalState.mode}
          item={modalState.mode === "edit" ? modalState.item : undefined}
          onClose={() => setModalState({ open: false })}
          onSuccess={handleModalSuccess}
        />
      )}

      {deletingItem && (
        <ConfirmModal
          isOpen={!!deletingItem}
          title="Ẩn nhóm addon"
          message={`Bạn có chắc muốn ẩn nhóm "${deletingItem.name}" cùng với tất cả option của nó? Khách hàng sẽ không thấy nhóm này nữa.`}
          confirmLabel="Ẩn nhóm"
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
