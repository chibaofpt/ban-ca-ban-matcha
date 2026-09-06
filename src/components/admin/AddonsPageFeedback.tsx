"use client";

import { Layers } from "lucide-react";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import type { AddonStatusFilter } from "@/src/components/admin/AddonsToolbar";

export type AddonVisibilityTarget =
  | { kind: "group"; groupId: string; name: string }
  | { kind: "option"; groupId: string; optionId: string; name: string };

interface AddonsEmptyStateProps {
  catalogueEmpty: boolean;
  status: AddonStatusFilter;
  onCreate: () => void;
}

/** Distinguish an empty catalogue from a status filter with no matching groups. */
export function AddonsEmptyState({ catalogueEmpty, status, onCreate }: AddonsEmptyStateProps) {
  const statusLabel = status === "active" ? "Đang hoạt động" : status === "inactive" ? "Đã ẩn" : "Tất cả";
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
      <Layers className="mb-4 h-12 w-12 opacity-50" />
      <p className="text-sm font-medium text-foreground">
        {catalogueEmpty ? "Chưa có nhóm addon nào." : `Không có nhóm nào ở trạng thái “${statusLabel}”.`}
      </p>
      {catalogueEmpty ? (
        <button type="button" onClick={onCreate} className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Thêm nhóm đầu tiên
        </button>
      ) : null}
    </div>
  );
}

interface AddonVisibilityConfirmProps {
  target: AddonVisibilityTarget;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirm the soft-hide action while keeping reactivation immediate. */
export function AddonVisibilityConfirm({ target, isLoading, onConfirm, onCancel }: AddonVisibilityConfirmProps) {
  return (
    <ConfirmModal
      isOpen
      title={target.kind === "group" ? `Ẩn nhóm “${target.name}”?` : `Ẩn option “${target.name}”?`}
      message={target.kind === "group"
        ? "Nhóm và toàn bộ option sẽ không hiện trong product modal. Bạn có thể hiện lại bất cứ lúc nào."
        : "Option sẽ không hiện trong product modal. Bạn có thể hiện lại bất cứ lúc nào."}
      confirmLabel="Ẩn"
      cancelLabel="Huỷ"
      isDestructive
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
