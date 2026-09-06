"use client";

import { useEffect, useState } from "react";
import { cn } from "@/src/utils/cn";
import PowderForm, {
  buildPowderDefaultValues,
  type PowderFormPayload,
} from "@/src/components/admin/PowderForm";
import { createPowder, updatePowder, togglePowderAvailability } from "@/src/services/adminPowderService";
import type { Powder } from "@/src/lib/types/powder";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";

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

/** Responsive powder editor: dialog on desktop and bottom sheet on mobile. */
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFilename, setImageFilename] = useState("");

  useEffect(() => {
    setImageFile(null);
    setImageFilename("");
    setErrorMsg(null);
  }, [open, mode, item?.id]);

  const handleSubmit = async (payload: PowderFormPayload) => {
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
      let saved: Powder;
      if (mode === "edit" && item) {
        saved = await updatePowder(item.id, payload, imageFile, requestedFilename);
      } else {
        saved = await createPowder(payload, imageFile, requestedFilename);
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
    <ResponsiveOverlay
      open={open}
      title={mode === "create" ? "Thêm bột mới" : `Chỉnh sửa — ${item?.name}`}
      description={mode === "create"
        ? "Điền thông tin để thêm loại bột matcha mới."
        : "Cập nhật thông tin, giá và trạng thái bán."}
      size="lg"
      busy={isSubmitting || isToggling}
      dismissPolicy="locked-while-busy"
      onOpenChange={(next) => { if (!next) onClose(); }}
    >
      <div className="space-y-5">
        {errorMsg && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {errorMsg}
          </div>
        )}

        {mode === "edit" && item && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-secondary/20 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Trạng thái bán</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.is_available ? "Bột đang được mở bán" : "Bột đang ngừng bán — khách không thấy"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Trạng thái bán của bột"
              aria-checked={item.is_available}
              onClick={handleToggle}
              disabled={isToggling || isSubmitting}
              className="flex h-10 w-12 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
            >
              <span className={cn(
                "relative block h-6 w-11 rounded-full transition-colors duration-200",
                item.is_available ? "bg-primary" : "bg-border",
              )}>
                <span className={cn(
                  "absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                  item.is_available && "translate-x-5",
                )} />
              </span>
            </button>
          </div>
        )}

        <CatalogImageFields
          currentImageUrl={item?.image_url}
          label="Ảnh bột matcha"
          imageFilename={imageFilename}
          disabled={isSubmitting}
          onFileChange={setImageFile}
          onFilenameChange={setImageFilename}
          onError={setErrorMsg}
        />

        <PowderForm
          mode={mode}
          defaultValues={defaultValues}
          latteItems={latteItems}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </ResponsiveOverlay>
  );
}
