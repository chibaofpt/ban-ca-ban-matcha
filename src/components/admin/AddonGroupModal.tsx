"use client";

import { useState } from "react";
import AddonGroupForm from "@/src/components/admin/AddonGroupForm";
import {
  buildAddonGroupDefaultValues,
  type AddonGroupFormSubmission,
} from "@/src/components/admin/addonGroupFormModel";
import { createAddonGroup, updateAddonGroup } from "@/src/services/adminAddonService";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFilename, setImageFilename] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const [imageDirty, setImageDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = () => {
    if (!isSubmitting && (formDirty || imageDirty)) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const handleSubmit = async ({ payload, optionImages }: AddonGroupFormSubmission) => {
    const requestedFilename = imageFilename.trim();
    if (/\.\.|[/\\\0]/.test(requestedFilename)) {
      setErrorMsg("Tên file ảnh không hợp lệ.");
      return;
    }
    if (requestedFilename && !imageFile && !item?.image_url) {
      setErrorMsg("Vui lòng chọn ảnh trước khi đặt tên file SEO.");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      let saved: AdminAddonGroup;
      if (mode === "edit" && item) {
        saved = await updateAddonGroup(item.id, payload, imageFile, requestedFilename, optionImages);
      } else {
        saved = await createAddonGroup(payload, imageFile, requestedFilename, optionImages);
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
    <ResponsiveOverlay
      open
      title={mode === "create" ? "Thêm nhóm add-on" : `Sửa nhóm “${item?.name}”`}
      description="Cấu hình cách tính giá, số lựa chọn và từng tùy chọn trong nhóm."
      size="lg"
      busy={isSubmitting}
      dismissPolicy="locked-while-busy"
      onOpenChange={(open) => { if (!open) requestClose(); }}
    >
      <div className="space-y-6">
        {errorMsg && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {errorMsg}
          </div>
        )}
        <CatalogImageFields
          currentImageUrl={item?.image_url}
          label="Ảnh mặc định của nhóm"
          cropPreset="compact"
          imageFilename={imageFilename}
          disabled={isSubmitting}
          onFileChange={(file) => { setImageFile(file); setImageDirty(true); }}
          onFilenameChange={(value) => { setImageFilename(value); setImageDirty(true); }}
          onError={setErrorMsg}
        />
        <AddonGroupForm
          mode={mode}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          onDirtyChange={setFormDirty}
        />
      </div>
      {confirmDiscard ? (
        <ConfirmModal
          isOpen
          title="Bỏ thay đổi chưa lưu?"
          message="Các thay đổi trong nhóm addon mới chưa được lưu. Bạn có muốn bỏ chúng?"
          confirmLabel="Bỏ thay đổi"
          isDestructive
          onConfirm={onClose}
          onCancel={() => setConfirmDiscard(false)}
        />
      ) : null}
    </ResponsiveOverlay>
  );
}
