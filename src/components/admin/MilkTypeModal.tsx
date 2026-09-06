"use client";

import { useState } from "react";
import MilkTypeForm, {
  buildMilkTypeDefaultValues,
  type MilkTypeFormPayload,
} from "@/src/components/admin/MilkTypeForm";
import { createMilkType, updateMilkType } from "@/src/services/adminMilkTypeService";
import type { AdminMilkType } from "@/src/lib/types/milkType";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import MilkTypeAvailabilityFields from "@/src/components/admin/MilkTypeAvailabilityFields";
import type { AdminMenuItem } from "@/src/lib/types/menu";

interface MilkTypeModalProps {
  mode: "create" | "edit";
  item?: AdminMilkType;
  menuItems: AdminMenuItem[];
  onClose: () => void;
  onSuccess: (item: AdminMilkType) => void;
}

export default function MilkTypeModal({
  mode,
  item,
  menuItems,
  onClose,
  onSuccess,
}: MilkTypeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFilename, setImageFilename] = useState("");
  const [isGlobalDefault, setIsGlobalDefault] = useState(item?.is_default ?? false);
  const [availableMenuItemIds, setAvailableMenuItemIds] = useState(() => item
    ? menuItems
      .filter((menuItem) => (
        menuItem.allowed_base_liquid_ids?.includes(item.id)
        || menuItem.default_base_liquid_id === item.id
        || (item.is_default && menuItem.category === "latte")
      ))
      .map((menuItem) => menuItem.id)
    : []);

  const handleSubmit = async (payload: MilkTypeFormPayload) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const requestedFilename = imageFilename.trim();
      let saved: AdminMilkType;

      // If user provided a requestedFilename but NO new file, AND they don't currently have an image, clear it.
      const finalFilename = (requestedFilename && !imageFile && !item?.image_url) ? null : requestedFilename;

      if (mode === "edit" && item) {
        const implicitMenuItemIds = menuItems
          .filter((menuItem) => (
            menuItem.default_base_liquid_id === item.id
            || (isGlobalDefault && menuItem.category === "latte")
          ))
          .map((menuItem) => menuItem.id);
        saved = await updateMilkType(item.id, {
          ...payload,
          available_menu_item_ids: [...new Set([...availableMenuItemIds, ...implicitMenuItemIds])],
        }, imageFile, finalFilename);
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
    <ResponsiveOverlay
      open
      title={mode === "create" ? "Thêm Base Liquid" : "Sửa Base Liquid"}
      description={mode === "create" ? "Thêm nền mới cho Latte hoặc Fusion." : `Cập nhật thông tin của ${item?.name}.`}
      size="lg"
      busy={isSubmitting}
      dismissPolicy="locked-while-busy"
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <div className="space-y-5">
        {errorMsg && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {errorMsg}
          </div>
        )}
        <CatalogImageFields
          currentImageUrl={item?.image_url}
          label="Ảnh Base Liquid"
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
          onDefaultChange={setIsGlobalDefault}
          availabilityFields={mode === "edit" && item ? (
            <MilkTypeAvailabilityFields
              menuItems={menuItems}
              baseLiquidId={item.id}
              isGlobalDefault={isGlobalDefault}
              value={availableMenuItemIds}
              disabled={isSubmitting}
              onChange={setAvailableMenuItemIds}
            />
          ) : undefined}
        />
      </div>
    </ResponsiveOverlay>
  );
}
