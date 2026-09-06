"use client";

import { useState } from "react";
import AddonOptionForm from "@/src/components/admin/AddonOptionForm";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import type { AddonOptionCreatePayload, AddonOptionDetailsMutationPayload, AdminAddonGroup } from "@/src/lib/types/addonGroup";

interface AddonOptionCreateOverlayProps {
  group: AdminAddonGroup;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (
    payload: AddonOptionCreatePayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
}

/** Keep new-option creation in the existing responsive sheet/dialog pattern. */
export default function AddonOptionCreateOverlay({
  group,
  isSubmitting,
  onClose,
  onSubmit,
}: AddonOptionCreateOverlayProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => {
    if (!isSubmitting && isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  return (
    <><ResponsiveOverlay
      open
      title={`Thêm option vào “${group.name}”`}
      description="Option mới sẽ được thêm vào cuối danh sách hiển thị của nhóm."
      size="md"
      busy={isSubmitting}
      dismissPolicy="locked-while-busy"
      onOpenChange={(open) => { if (!open) requestClose(); }}
    >
      <AddonOptionForm
        mode="create"
        isDynamicGram={group.is_dynamic_gram}
        isSubmitting={isSubmitting}
        onDirtyChange={setIsDirty}
        onCancel={requestClose}
        onSubmit={(payload: AddonOptionCreatePayload | AddonOptionDetailsMutationPayload, file, filename) =>
          onSubmit(payload as AddonOptionCreatePayload, file, filename)}
      />
    </ResponsiveOverlay>
    {confirmDiscard ? (
      <ConfirmModal
        isOpen
        title="Bỏ thay đổi chưa lưu?"
        message="Option mới chưa được lưu. Bạn có muốn bỏ các thay đổi?"
        confirmLabel="Bỏ thay đổi"
        isDestructive
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    ) : null}</>
  );
}
