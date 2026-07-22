"use client";

import { useState } from "react";
import { X } from "lucide-react";
import PowderForm, {
  buildPowderDefaultValues,
  type PowderFormPayload,
} from "@/src/components/admin/PowderForm";
import { createPowder, updatePowder } from "@/src/services/adminPowderService";
import type { Powder } from "@/src/lib/types/powder";
import type { AdminMenuItem } from "@/src/lib/types/menu";

interface PowderModalProps {
  mode: "create" | "edit";
  item?: Powder;  // Required when mode="edit"
  latteItems: AdminMenuItem[];
  onClose: () => void;
  onSuccess: (item: Powder) => void;
}

import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";

export default function PowderModal({
  mode,
  item,
  latteItems,
  onClose,
  onSuccess,
}: PowderModalProps) {
  useBodyScrollLock(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const defaultValues = mode === "edit" && item ? buildPowderDefaultValues(item) : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "Thêm bột mới" : "Sửa bột"}
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

        <div className="overflow-y-auto overscroll-contain px-5 py-4 flex-1">
          {errorMsg && (
            <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {errorMsg}
            </div>
          )}
          <PowderForm
            mode={mode}
            defaultValues={defaultValues}
            latteItems={latteItems}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
