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
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm p-0 transition-opacity">
      <div 
        className="w-full max-w-2xl h-full bg-background flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 bg-card/50 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">
              {mode === "create" ? "Thêm món mới" : "Chỉnh sửa món"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "create" ? "Điền thông tin để tạo món mới trên menu" : "Cập nhật thông tin chi tiết của món"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {errorMsg && (
            <div className="mx-6 mt-6 mb-0 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium shrink-0">
              {errorMsg}
            </div>
          )}

          <MenuItemForm
            mode={mode}
            defaultValues={item ? buildDefaultValues(item) : undefined}
            powders={powders}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
