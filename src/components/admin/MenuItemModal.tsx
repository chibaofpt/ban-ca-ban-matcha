"use client";

import { useState } from "react";
import { X } from "lucide-react";
import axios from "axios";
import MenuItemForm, { buildDefaultValues } from "@/src/components/admin/MenuItemForm";
import { createMenuItem, updateMenuItem } from "@/src/services/adminMenuService";
import { createLatteWithPowder } from "@/src/services/adminMenuService";
import type { AdminMenuItem, MilkTypeOption, Size } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import MenuImageSeoField from "@/src/components/admin/MenuImageSeoField";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";

interface MenuItemModalProps {
  mode: "create" | "edit";
  item?: AdminMenuItem;  // Required when mode="edit"
  powders: Powder[];
  baseLiquids: MilkTypeOption[];
  defaultSizeConfig: Array<{ size: Size; base_liquid_ml: number }>;
  onClose: () => void;
  onSuccess: (item: AdminMenuItem, powderName?: string) => void;
}

interface PendingPriceChange {
  formData: FormData;
  activeVoucherCount: number;
  oldPriceVnd: number;
  newPriceVnd: number;
}

function formatVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

/** Unified modal cho tạo mới và sửa menu item. */
export default function MenuItemModal({
  mode,
  item,
  powders,
  baseLiquids,
  defaultSizeConfig,
  onClose,
  onSuccess,
}: MenuItemModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingPriceChange, setPendingPriceChange] = useState<PendingPriceChange | null>(null);
  const [imageFilename, setImageFilename] = useState("");

  const handleSubmit = async (fd: FormData) => {
    setErrorMsg(null);
    const requestedFilename = imageFilename.trim();
    if (/\.\.|[/\\\0]/.test(requestedFilename)) {
      setErrorMsg("Tên file ảnh không hợp lệ.");
      return;
    }
    const image = fd.get("image");
    const hasNewImage = image instanceof File && image.size > 0;
    if (requestedFilename && !hasNewImage && !item?.image_url) {
      setErrorMsg("Vui lòng chọn ảnh trước khi đặt tên file SEO.");
      return;
    }
    if (requestedFilename) fd.set("image_filename", requestedFilename);

    setIsSubmitting(true);
    try {
      let saved: AdminMenuItem;
      let createdPowderName: string | undefined = undefined;

      if (mode === "edit" && item) {
        saved = await updateMenuItem(item.id, fd);
      } else {
        if (fd.get("new_powder_name")) {
          const res = await createLatteWithPowder(fd);
          saved = res.menu_item;
          createdPowderName = res.powder_name;
        } else {
          saved = await createMenuItem(fd);
        }
      }
      onSuccess(saved, createdPowderName);
      onClose();
    } catch (err: unknown) {
      if (
        mode === "edit" &&
        axios.isAxiosError(err) &&
        err.response?.status === 409 &&
        err.response.data?.code === "CONFLICT" &&
        err.response.data?.details?.reason === "ACTIVE_ITEM_VOUCHERS"
      ) {
        const details = err.response.data.details as {
          count?: number;
          old_unit_price_vnd?: number;
          new_unit_price_vnd?: number;
        };
        setPendingPriceChange({
          formData: fd,
          activeVoucherCount: details.count ?? 0,
          oldPriceVnd: details.old_unit_price_vnd ?? 0,
          newPriceVnd: details.new_unit_price_vnd ?? 0,
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.";
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = mode === "create" ? "Thêm món mới" : "Chỉnh sửa món";
  const description = mode === "create"
    ? "Điền thông tin để tạo món mới trên menu."
    : "Cập nhật thông tin chi tiết của món.";

  return (
    <>
      <ResponsiveOverlay
        open
        title={title}
        description={description}
        presentation="bare"
        busy={isSubmitting}
        dismissPolicy="locked-while-busy"
        className="md:max-w-2xl"
        onOpenChange={(open) => { if (!open) onClose(); }}
      >
        <div className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl md:h-[calc(100dvh-2rem)] md:rounded-3xl md:border">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border md:hidden" aria-hidden="true" />

          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 bg-card/50 px-5 py-4 backdrop-blur-md md:px-6">
            <div>
              <h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Đóng"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {errorMsg && (
              <div className="mx-5 mt-5 shrink-0 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive md:mx-6 md:mt-6">
                {errorMsg}
              </div>
            )}

            <MenuImageSeoField
              currentImageUrl={item?.image_url}
              value={imageFilename}
              onChange={setImageFilename}
              disabled={isSubmitting}
            />

            <MenuItemForm
              mode={mode}
              defaultValues={item ? buildDefaultValues(item) : undefined}
              powders={powders}
              baseLiquids={baseLiquids}
              defaultSizeConfig={defaultSizeConfig}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              onCancel={onClose}
            />
          </div>
        </div>
      </ResponsiveOverlay>
      <ConfirmModal
        isOpen={pendingPriceChange !== null}
        title="Xác nhận đổi giá Add-on?"
        message={pendingPriceChange
          ? `Có ${pendingPriceChange.activeVoucherCount} voucher ITEM còn hiệu lực. Giá sẽ đổi từ ${formatVnd(pendingPriceChange.oldPriceVnd)} sang ${formatVnd(pendingPriceChange.newPriceVnd)}; các voucher đã phát hành vẫn tặng miễn phí món này theo giá mới. Bạn có chắc muốn tiếp tục?`
          : ""}
        confirmLabel="Đổi giá"
        onCancel={() => setPendingPriceChange(null)}
        onConfirm={() => {
          const retry = pendingPriceChange?.formData;
          setPendingPriceChange(null);
          if (retry) {
            retry.set("confirm_price_change", "true");
            void handleSubmit(retry);
          }
        }}
      />
    </>
  );
}
