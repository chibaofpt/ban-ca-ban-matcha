"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { BadgeDollarSign, Scale } from "lucide-react";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import type { AddonGroupDetailsMutationPayload, AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { cn } from "@/src/utils/cn";

interface FormFields {
  name: string;
  description: string;
  max_select: number;
}

interface AddonGroupInlineFormProps {
  item: AdminAddonGroup;
  isSubmitting: boolean;
  presentation?: "inline" | "overlay";
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (
    payload: AddonGroupDetailsMutationPayload,
    imageFile: File | null,
    imageFilename: string,
  ) => Promise<void>;
}

/** Render the focused editor for one existing add-on group. */
export default function AddonGroupInlineForm({
  item,
  isSubmitting,
  presentation = "inline",
  onDirtyChange,
  onCancel,
  onSubmit,
}: AddonGroupInlineFormProps) {
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
      name: item.name,
      description: item.description ?? "",
      max_select: item.max_select,
    },
  });

  useEffect(() => {
    onDirtyChange(isDirty || imageFile !== null || imageFilename.trim().length > 0);
  }, [imageFile, imageFilename, isDirty, onDirtyChange]);

  const submit = handleSubmit(async (values) => {
    const requestedFilename = imageFilename.trim();
    if (/\.\.|[/\\\0]/.test(requestedFilename)) {
      setImageError("Tên file ảnh không hợp lệ.");
      return;
    }
    if (requestedFilename && !imageFile && !item.image_url) {
      setImageError("Vui lòng chọn ảnh trước khi đặt tên file SEO.");
      return;
    }
    try {
      await onSubmit({
        name: values.name.trim(),
        description: values.description.trim() || null,
        max_select: item.is_dynamic_gram ? 1 : Number(values.max_select),
      }, imageFile, requestedFilename);
    } catch {
      // The mutation hook keeps the editor open and surfaces the server message.
    }
  });

  const inputClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";

  return (
    <form
      onSubmit={submit}
      className={cn(presentation === "inline" && "border-t border-border/60 bg-secondary/10 p-4 sm:p-5")}
    >
      <div className={cn(
        "grid gap-5",
        presentation === "inline" ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : "sm:grid-cols-[12rem_minmax(0,1fr)]",
      )}>
        <div>
          <CatalogImageFields
            currentImageUrl={item.image_url}
            label="Ảnh nhóm addon"
            cropPreset="compact"
            layout="inline"
            inputId={`addon-group-image-${item.id}`}
            imageFilename={imageFilename}
            disabled={isSubmitting}
            onFileChange={(file) => { setImageFile(file); setImageError(null); }}
            onFilenameChange={setImageFilename}
            onError={setImageError}
          />
          {imageError ? <p className="mt-1 text-xs text-destructive">{imageError}</p> : null}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground">
              Title
              <input
                {...register("name", { required: "Vui lòng nhập title", maxLength: 100 })}
                className={inputClass}
                autoFocus
              />
              {errors.name ? <span className="mt-1 block text-xs text-destructive">{errors.name.message}</span> : null}
            </label>
            <label className="text-sm font-medium text-foreground">
              Chọn tối đa
              <input
                type="number"
                min={1}
                disabled={item.is_dynamic_gram || isSubmitting}
                {...register("max_select", { valueAsNumber: true, min: { value: 1, message: "Tối thiểu là 1" } })}
                className={inputClass}
              />
              {item.is_dynamic_gram ? <span className="mt-1 block text-xs text-muted-foreground">Nhóm theo gram luôn chọn tối đa 1.</span> : null}
            </label>
          </div>

          <label className="block text-sm font-medium text-foreground">
            Mô tả
            <textarea {...register("description", { maxLength: 500 })} className={cn(inputClass, "min-h-20 resize-y")} />
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-foreground">Cách tính giá</legend>
            <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Cách tính giá không thể thay đổi sau khi tạo">
              {[
                { value: false, label: "Giá cố định", icon: BadgeDollarSign },
                { value: true, label: "Theo gram bột", icon: Scale },
              ].map((choice) => {
                const Icon = choice.icon;
                const selected = item.is_dynamic_gram === choice.value;
                return (
                  <button
                    key={choice.label}
                    type="button"
                    disabled
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium",
                      selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground opacity-60",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Loại giá được khóa để giữ tương thích với đơn hàng hiện có.</p>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={isSubmitting} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-secondary/50 disabled:opacity-50">
              Hủy
            </button>
            <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
