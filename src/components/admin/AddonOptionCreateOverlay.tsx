"use client";

import AddonOptionForm from "@/src/components/admin/AddonOptionForm";
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
  return (
    <ResponsiveOverlay
      open
      title={`Thêm option vào “${group.name}”`}
      description="Option mới sẽ được thêm vào cuối danh sách hiển thị của nhóm."
      size="md"
      busy={isSubmitting}
      dismissPolicy="locked-while-busy"
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <AddonOptionForm
        mode="create"
        isDynamicGram={group.is_dynamic_gram}
        isSubmitting={isSubmitting}
        onCancel={onClose}
        onSubmit={(payload: AddonOptionCreatePayload | AddonOptionDetailsMutationPayload, file, filename) =>
          onSubmit(payload as AddonOptionCreatePayload, file, filename)}
      />
    </ResponsiveOverlay>
  );
}
