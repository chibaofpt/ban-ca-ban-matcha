"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { cn } from "@/src/utils/cn";
import PowderForm, {
  buildPowderDefaultValues,
  type PowderFormPayload,
} from "@/src/components/admin/PowderForm";
import { createPowder, updatePowder, togglePowderAvailability } from "@/src/services/adminPowderService";
import type { Powder } from "@/src/lib/types/powder";
import type { AdminMenuItem } from "@/src/lib/types/menu";

interface PowderDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  /** Required when mode="edit" */
  item?: Powder;
  latteItems: AdminMenuItem[];
  onClose: () => void;
  onSuccess: (item: Powder) => void;
  /** Called after toggling availability from inside the drawer */
  onToggleSuccess?: (id: string, next: boolean) => void;
}

/** Bottom sheet (Vaul Drawer) thay thế PowderModal — mở khi bấm vào dòng bột. */
export default function PowderDrawer({
  open,
  mode,
  item,
  latteItems,
  onClose,
  onSuccess,
  onToggleSuccess,
}: PowderDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (payload: PowderFormPayload) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      let saved: Powder;
      if (mode === "edit" && item) {
        saved = await updatePowder(item.id, payload);
      } else {
        saved = await createPowder(payload);
      }
      onSuccess(saved);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.";
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async () => {
    if (!item) return;
    const next = !item.is_available;
    setIsToggling(true);
    try {
      await togglePowderAvailability(item.id, next);
      onToggleSuccess?.(item.id, next);
      onClose();
    } catch {
      setErrorMsg("Không thể thay đổi trạng thái. Vui lòng thử lại.");
    } finally {
      setIsToggling(false);
    }
  };

  const defaultValues =
    mode === "edit" && item ? buildPowderDefaultValues(item) : undefined;

  return (
    <Drawer.Root
      open={open}
      dismissible={!isSubmitting && !isToggling}
      onOpenChange={(next) => !next && onClose()}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex max-h-[92dvh] max-w-2xl flex-col rounded-t-[1.5rem] bg-card shadow-2xl outline-none"
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border/60 shrink-0" />

          {/* Header */}
          <header className="flex items-start justify-between gap-4 border-b border-border/60 px-6 pb-4 pt-3 shrink-0">
            <div>
              <Drawer.Title className="text-lg font-semibold text-foreground">
                {mode === "create" ? "Thêm bột mới" : `Chỉnh sửa — ${item?.name}`}
              </Drawer.Title>
              <Drawer.Description className="mt-0.5 text-xs text-muted-foreground">
                {mode === "create"
                  ? "Điền thông tin để thêm loại bột matcha mới"
                  : "Cập nhật thông tin, giá và trạng thái bán"}
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isToggling}
              aria-label="Đóng"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5 custom-scrollbar">
            {/* Error banner */}
            {errorMsg && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
                {errorMsg}
              </div>
            )}

            {/* Toggle bật/tắt — chỉ hiện khi edit */}
            {mode === "edit" && item && (
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/20 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Trạng thái bán
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.is_available
                      ? "Bột đang được mở bán"
                      : "Bột đang ngừng bán — khách không thấy"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.is_available}
                  onClick={handleToggle}
                  disabled={isToggling || isSubmitting}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
                    item.is_available ? "bg-primary" : "bg-border"
                  )}
                >
                  <span
                    className={cn(
                      "block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 m-0.5",
                      item.is_available ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            )}

            {/* Form */}
            <PowderForm
              mode={mode}
              defaultValues={defaultValues}
              latteItems={latteItems}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
