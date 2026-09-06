"use client";

import AddonGroupInlineForm from "@/src/components/admin/AddonGroupInlineForm";
import AddonOptionForm from "@/src/components/admin/AddonOptionForm";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import type {
  AddonGroupDetailsMutationPayload,
  AddonOptionCreatePayload,
  AddonOptionDetailsMutationPayload,
  AdminAddonGroup,
  AdminAddonOption,
} from "@/src/lib/types/addonGroup";

export type AddonEditTarget =
  | { kind: "group"; group: AdminAddonGroup }
  | { kind: "option"; group: AdminAddonGroup; option: AdminAddonOption };

interface AddonEditOverlayProps {
  target: AddonEditTarget;
  isSubmitting: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
  onSaveGroup: (
    payload: AddonGroupDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
  onSaveOption: (
    payload: AddonOptionDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
}

/** Render the existing add-on editors in the shared responsive sheet/dialog primitive. */
export default function AddonEditOverlay({
  target,
  isSubmitting,
  onDirtyChange,
  onClose,
  onSaveGroup,
  onSaveOption,
}: AddonEditOverlayProps) {
  const entityName = target.kind === "group" ? target.group.name : target.option.label;

  return (
    <ResponsiveOverlay
      open
      title={`${target.kind === "group" ? "Sửa nhóm" : "Sửa option"} “${entityName}”`}
      description={target.kind === "group"
        ? "Cập nhật thông tin hiển thị và giới hạn chọn của nhóm add-on."
        : `Cập nhật thông tin option thuộc nhóm ${target.group.name}.`}
      size="md"
      busy={isSubmitting}
      dismissPolicy="locked-while-busy"
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      {target.kind === "group" ? (
        <AddonGroupInlineForm
          item={target.group}
          isSubmitting={isSubmitting}
          presentation="overlay"
          onDirtyChange={onDirtyChange}
          onCancel={onClose}
          onSubmit={onSaveGroup}
        />
      ) : (
        <AddonOptionForm
          mode="edit"
          isDynamicGram={target.group.is_dynamic_gram}
          option={target.option}
          isSubmitting={isSubmitting}
          onDirtyChange={onDirtyChange}
          onCancel={onClose}
          onSubmit={(payload: AddonOptionCreatePayload | AddonOptionDetailsMutationPayload, file, filename) =>
            onSaveOption(payload as AddonOptionDetailsMutationPayload, file, filename)}
        />
      )}
    </ResponsiveOverlay>
  );
}
