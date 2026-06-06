"use client";

import { useState } from "react";
import { X } from "lucide-react";
import MenuItemForm, { buildDefaultValues } from "@/src/components/admin/MenuItemForm";
import { createMenuItem, updateMenuItem } from "@/src/services/adminMenuService";
import { createLatteWithPowder } from "@/src/services/adminMenuService";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";

interface MenuItemModalProps {
  mode: "create" | "edit";
  item?: AdminMenuItem;  // Required when mode="edit"
  powders: Powder[];
  onClose: () => void;
  onSuccess: (item: AdminMenuItem, powderName?: string) => void;
}

/** Unified modal cho tạo mới và sửa menu item. */
export default function MenuItemModal({
  mode,
  item,
  powders,
  onClose,
  onSuccess,
}: MenuItemModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (fd: FormData) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      let saved: AdminMenuItem;
      let createdPowderName: string | undefined = undefined;

      if (mode === "edit" && item) {
        saved = await updateMenuItem(item.id, fd);
      } else {
        if (fd.get("new_powder_name")) {
          const res = await createLatteWithPowder(fd);
          saved = res.menu_item;
          createdPowderName = res.powder_name;
        } else {
          saved = await createMenuItem(fd);
        }
      }
      onSuccess(saved, createdPowderName);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.";
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultValues = mode === "edit" && item ? buildDefaultValues(item) : undefined;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "Thêm món mới" : "Sửa món"}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-secondary/60 transition text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {errorMsg && (
            <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {errorMsg}
            </div>
          )}
          <MenuItemForm
            mode={mode}
            defaultValues={defaultValues}
            powders={powders}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
