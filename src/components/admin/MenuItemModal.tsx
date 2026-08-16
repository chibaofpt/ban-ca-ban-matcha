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
import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";

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
  useBodyScrollLock(true);
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

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm p-0 transition-opacity">
      <div 
        className="w-full max-w-2xl h-full bg-background flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 bg-card/50 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h2 className="font-serif text-xl font-bold text-foreground">
              {mode === "create" ? "Thêm món mới" : "Chỉnh sửa món"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "create" ? "Điền thông tin để tạo món mới trên menu" : "Cập nhật thông tin chi tiết của món"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {errorMsg && (
            <div className="mx-6 mt-6 mb-0 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium shrink-0">
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
    </div>
  );
}
