"use client";

import { useState } from "react";
import { X } from "lucide-react";
import MilkTypeForm, {
  buildMilkTypeDefaultValues,
  type MilkTypeFormPayload,
} from "@/src/components/admin/MilkTypeForm";
import { createMilkType, updateMilkType } from "@/src/services/adminMilkTypeService";
import type { AdminMilkType } from "@/src/lib/types/milkType";
import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";

interface MilkTypeModalProps {
  mode: "create" | "edit";
  item?: AdminMilkType;
  onClose: () => void;
  onSuccess: (item: AdminMilkType) => void;
}

export default function MilkTypeModal({
  mode,
  item,
  onClose,
  onSuccess,
}: MilkTypeModalProps) {
  useBodyScrollLock(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFilename, setImageFilename] = useState("");

  const handleSubmit = async (payload: MilkTypeFormPayload) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const requestedFilename = imageFilename.trim();
      let saved: AdminMilkType;

      // If user provided a requestedFilename but NO new file, AND they don't currently have an image, clear it.
      const finalFilename = (requestedFilename && !imageFile && !item?.image_url) ? null : requestedFilename;

      if (mode === "edit" && item) {
        saved = await updateMilkType(item.id, payload, imageFile, finalFilename);
      } else {
        saved = await createMilkType(payload, imageFile, finalFilename);
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

  const defaultValues = mode === "edit" && item ? buildMilkTypeDefaultValues(item) : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "create" ? "Thêm loại sữa mới" : "Sửa thông tin sữa"}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-secondary transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <CatalogImageFields
            currentImageUrl={item?.image_url}
            label="Ảnh loại sữa"
            cropPreset="compact"
            imageFilename={imageFilename}
            disabled={isSubmitting}
            onFileChange={setImageFile}
            onFilenameChange={setImageFilename}
            onError={setErrorMsg}
          />
          <MilkTypeForm
            mode={mode}
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
          {errorMsg && (
            <div className="mt-4 text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-lg text-center">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
