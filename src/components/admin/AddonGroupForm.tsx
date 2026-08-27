"use client";

import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { cn } from "@/src/utils/cn";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import type {
  AddonGroupFormFields as FormFields,
  AddonGroupFormSubmission,
} from "@/src/components/admin/addonGroupFormModel";

function createOptionImageKey(): string {
  return `new-${crypto.randomUUID()}`;
}

interface AddonGroupFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<FormFields>;
  onSubmit: (data: AddonGroupFormSubmission) => Promise<void>;
  isSubmitting: boolean;
}

export default function AddonGroupForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
}: AddonGroupFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormFields>({
    defaultValues: {
      name: "",
      description: "",
      type: "SELECTOR",
      max_quantity: "",
      is_active: true,
      options: [
        {
          image_key: createOptionImageKey(),
          image_url: null,
          image_file: null,
          image_filename: "",
          label: "",
          price_vnd: "0",
          is_active: true,
          sort_order: "0",
          gram_value: "",
        }
      ],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
    keyName: "fieldKey",
  });

  const type = useWatch({ control, name: "type" });

  const onFormSubmit = async (values: FormFields) => {
    let hasImageError = false;
    values.options.forEach((option, index) => {
      const filename = option.image_filename.trim();
      if (/\.\.|[/\\\0]/.test(filename)) {
        setError(`options.${index}.image_filename`, { message: "Tên file ảnh không hợp lệ." });
        hasImageError = true;
      } else if (filename && !option.image_file && !option.image_url) {
        setError(`options.${index}.image_filename`, { message: "Vui lòng chọn ảnh trước khi đặt tên file SEO." });
        hasImageError = true;
      } else {
        clearErrors(`options.${index}.image_filename`);
      }
    });
    if (hasImageError) return;

    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      type: values.type,
      max_quantity: values.type === "QUANTITY" && values.max_quantity ? Number(values.max_quantity) : null,
      is_active: values.is_active,
      options: values.options.map((opt, idx) => ({
        id: opt.id,
        image_key: opt.image_key,
        label: opt.label.trim(),
        price_vnd: Number(opt.price_vnd),
        is_active: opt.is_active,
        sort_order: opt.sort_order !== "" ? Number(opt.sort_order) : idx,
        gram_value: opt.gram_value !== "" ? Number(opt.gram_value) : null,
      })),
    };
    await onSubmit({
      payload,
      optionImages: values.options.map((option) => ({
        imageKey: option.image_key,
        imageFile: option.image_file,
        imageFilename: option.image_filename,
      })),
    });
  };

  const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 disabled:opacity-50";
  const labelClass = "text-sm font-medium text-foreground";
  const errorClass = "text-xs text-destructive mt-1";

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* ── Group Info ── */}
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Tên nhóm *</label>
          <input
            {...register("name", { required: "Vui lòng nhập tên nhóm" })}
            placeholder="Ví dụ: Kem, Trân châu, Extra Matcha..."
            className={inputClass}
          />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelClass}>Mô tả</label>
          <textarea
            {...register("description")}
            placeholder="Hiển thị phụ bên dưới tên nhóm..."
            className={cn(inputClass, "min-h-[60px] resize-none")}
          />
        </div>

        <div>
          <div>
            <label className={labelClass}>Loại hiển thị</label>
            <select {...register("type")} className={inputClass}>
              <option value="SELECTOR">Selector (chỉ chọn 1)</option>
              <option value="TOGGLE">Toggle (bật / tắt)</option>
              <option value="QUANTITY">Quantity (+/- số lượng)</option>
            </select>
          </div>
          
        </div>

        {type === "QUANTITY" && (
          <div className="pt-2 border-t border-border/50">
            <div>
              <label className={labelClass}>Số lượng tối đa</label>
              <input type="number" min="1" {...register("max_quantity")} className={inputClass} placeholder="Bắt buộc" />
            </div>
          </div>
        )}
      </div>

      {/* ── Options List ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="font-semibold text-foreground">Danh sách Options</h3>
          <button
            type="button"
            onClick={() => append({
              image_key: createOptionImageKey(),
              image_url: null,
              image_file: null,
              image_filename: "",
              label: "",
              price_vnd: "0",
              is_active: true,
              sort_order: String(fields.length),
              gram_value: "",
            })}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg"
          >
            <Plus size={16} /> Thêm option
          </button>
        </div>

        {errors.options?.root && (
          <p className={errorClass}>{errors.options.root.message}</p>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.fieldKey} className="group relative flex flex-col items-stretch gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-start">
              <input type="hidden" {...register(`options.${index}.image_key`)} />
              <input type="hidden" {...register(`options.${index}.image_url`)} />
              <Controller
                name={`options.${index}.image_filename`}
                control={control}
                render={({ field: filenameField }) => (
                  <div className="shrink-0 sm:w-40">
                    <CatalogImageFields
                      currentImageUrl={field.image_url}
                      label="Ảnh option"
                      cropPreset="compact"
                      layout="inline"
                      inputId={`addon-option-image-${field.image_key}`}
                      imageFilename={filenameField.value}
                      disabled={isSubmitting}
                      onFileChange={(file) => {
                        setValue(`options.${index}.image_file`, file, { shouldDirty: true });
                        clearErrors(`options.${index}.image_file`);
                      }}
                      onFilenameChange={filenameField.onChange}
                      onError={(message) => {
                        if (message) setError(`options.${index}.image_file`, { message });
                        else clearErrors(`options.${index}.image_file`);
                      }}
                    />
                    {(errors.options?.[index]?.image_file?.message || errors.options?.[index]?.image_filename?.message) && (
                      <p className={errorClass}>
                        {errors.options[index]?.image_file?.message ?? errors.options[index]?.image_filename?.message}
                      </p>
                    )}
                  </div>
                )}
              />
              
              <div className="flex-1 grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-5">
                  <label className="text-xs text-muted-foreground mb-1 block">Tên option *</label>
                  <input
                    {...register(`options.${index}.label`, { required: "Bắt buộc" })}
                    placeholder="VD: Kem sữa"
                    className={cn(inputClass, "mt-0")}
                  />
                  {errors.options?.[index]?.label && <p className={errorClass}>{errors.options[index]?.label?.message}</p>}
                </div>
                
                <div className="col-span-6 sm:col-span-3">
                  <label className="text-xs text-muted-foreground mb-1 block">Giá (VND) *</label>
                  <input
                    type="number"
                    min="0"
                    {...register(`options.${index}.price_vnd`, {
                      required: "Bắt buộc",
                      min: { value: 0, message: "Giá không được âm" },
                    })}
                    className={cn(inputClass, "mt-0", errors.options?.[index]?.price_vnd && "border-destructive focus:ring-destructive/40")}
                  />
                  {errors.options?.[index]?.price_vnd && <p className={errorClass}>{errors.options[index]?.price_vnd?.message}</p>}
                </div>

                <div className="col-span-6 sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Gram động</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    {...register(`options.${index}.gram_value`)}
                    placeholder="Để trống nếu giá cố định"
                    className={cn(inputClass, "mt-0 border-amber-200 bg-amber-50 dark:bg-amber-950/20")}
                  />
                </div>

                <div className="col-span-12 sm:col-span-2 flex flex-col justify-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register(`options.${index}.is_active`)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-medium">Đang bán</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length === 1 || Boolean(field.id)}
                className="absolute -top-2 -right-2 p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition opacity-0 group-hover:opacity-100 disabled:opacity-0 shadow-sm"
                title="Xóa option"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2">
          <label className={labelClass}>Nhóm đang mở bán</label>
          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <button
                type="button"
                role="switch"
                aria-checked={field.value}
                onClick={() => field.onChange(!field.value)}
                className={cn(
                  "relative inline-flex h-5 w-9 rounded-full transition",
                  field.value ? "bg-primary" : "bg-border"
                )}
              >
                <span
                  className={cn(
                    "block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5",
                    field.value ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            )}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 w-full sm:w-auto"
        >
          {isSubmitting ? "Đang xử lý..." : mode === "create" ? "Tạo nhóm addon" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
