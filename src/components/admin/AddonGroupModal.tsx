"use client";

import { useState } from "react";
import { X } from "lucide-react";
import AddonGroupForm from "@/src/components/admin/AddonGroupForm";
import {
  buildAddonGroupDefaultValues,
  type AddonGroupFormPayload,
} from "@/src/components/admin/addonGroupFormModel";
import { createAddonGroup, updateAddonGroup } from "@/src/services/adminAddonService";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";

interface AddonGroupModalProps {
  mode: "create" | "edit";
  item?: AdminAddonGroup;
  onClose: () => void;
  onSuccess: (item: AdminAddonGroup) => void;
}

export default function AddonGroupModal({
  mode,
  item,
  onClose,
  onSuccess,
}: AddonGroupModalProps) {
  useBodyScrollLock(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (payload: AddonGroupFormPayload) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      let saved: AdminAddonGroup;
      if (mode === "edit" && item) {
        saved = await updateAddonGroup(item.id, payload);
      } else {
        saved = await createAddonGroup(payload);
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

  const defaultValues = mode === "edit" && item ? buildAddonGroupDefaultValues(item) : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-xl flex flex-col max-h-full">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-foreground">
            {mode === "create" ? "Thêm nhóm addon mới" : `Sửa nhóm "${item?.name}"`}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-secondary/60 transition text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-6 py-5 flex-1 custom-scrollbar">
          {errorMsg && (
            <div className="mb-5 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
              {errorMsg}
            </div>
          )}
          <AddonGroupForm
            mode={mode}
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
