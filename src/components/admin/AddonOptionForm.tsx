"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import type {
  AddonOptionCreatePayload,
  AddonOptionDetailsMutationPayload,
  AdminAddonOption,
} from "@/src/lib/types/addonGroup";

interface FormFields {
  label: string;
  value: number;
  is_active: boolean;
}

interface AddonOptionFormProps {
  mode: "create" | "edit";
  isDynamicGram: boolean;
  option?: AdminAddonOption;
  isSubmitting: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (
    payload: AddonOptionCreatePayload | AddonOptionDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
}

/** Render add-on option fields for the create overlay or compact inline editor. */
export default function AddonOptionForm({
  mode,
  isDynamicGram,
  option,
  isSubmitting,
  onDirtyChange,
  onCancel,
  onSubmit,
}: AddonOptionFormProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFilename, setImageFilename] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormFields>({
    mode: "onBlur",
    defaultValues: {
      label: option?.label ?? "",
      value: isDynamicGram ? option?.gram_value ?? 1 : option?.price_vnd ?? 0,
      is_active: option?.is_active ?? true,
    },
  });

  useEffect(() => {
    onDirtyChange?.(isDirty || imageFile !== null || imageFilename.trim().length > 0);
  }, [imageFile, imageFilename, isDirty, onDirtyChange]);

  const submit = handleSubmit(async (values) => {
    const requestedFilename = imageFilename.trim();
    if (/\.\.|[/\\\0]/.test(requestedFilename)) {
      setImageError("Tên file ảnh không hợp lệ.");
      return;
    }
    if (requestedFilename && !imageFile && !option?.image_url) {
      setImageError("Vui lòng chọn ảnh trước khi đặt tên file SEO.");
      return;
    }
    const details: AddonOptionDetailsMutationPayload = {
      label: values.label.trim(),
      price_vnd: isDynamicGram ? 0 : Number(values.value),
      gram_value: isDynamicGram ? Number(values.value) : null,
    };
    const payload = mode === "create"
      ? { ...details, is_active: values.is_active }
      : details;
    try {
      await onSubmit(payload, imageFile, requestedFilename);
    } catch {
      // The mutation hook displays the API error and leaves the form mounted.
    }
  });

  const inputClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <CatalogImageFields
            currentImageUrl={option?.image_url}
            label="Ảnh option"
            cropPreset="compact"
            layout="inline"
            inputId={`addon-option-image-${option?.id ?? "new"}`}
            imageFilename={imageFilename}
            disabled={isSubmitting}
            onFileChange={(file) => { setImageFile(file); setImageError(null); }}
            onFilenameChange={setImageFilename}
            onError={setImageError}
          />
          {imageError ? <p className="mt-1 text-xs text-destructive">{imageError}</p> : null}
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
            Title
            <input
              {...register("label", { required: "Vui lòng nhập title", maxLength: 100 })}
              className={inputClass}
              autoFocus={mode === "edit"}
            />
            {errors.label ? <span className="mt-1 block text-xs text-destructive">{errors.label.message}</span> : null}
          </label>
          <label className="block text-sm font-medium text-foreground">
            {isDynamicGram ? "Số gram bột" : "Giá cộng thêm (VND)"}
            <input
              type="number"
              min={isDynamicGram ? 0.1 : 0}
              step={isDynamicGram ? 0.1 : 1000}
              {...register("value", {
                valueAsNumber: true,
                min: { value: isDynamicGram ? 0.1 : 0, message: "Giá trị không hợp lệ" },
              })}
              className={inputClass}
            />
            {errors.value ? <span className="mt-1 block text-xs text-destructive">{errors.value.message}</span> : null}
          </label>
          {mode === "create" ? (
            <label className="flex min-h-11 items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2 text-sm">
              <input type="checkbox" {...register("is_active")} className="h-5 w-5 rounded" />
              Hiển thị option ngay sau khi tạo
            </label>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-secondary/50 disabled:opacity-50">
          Hủy
        </button>
        <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isSubmitting ? "Đang lưu..." : mode === "create" ? "Tạo option" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
