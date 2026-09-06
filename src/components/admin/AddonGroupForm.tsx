"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { ArrowDown, ArrowUp, BadgeDollarSign, Plus, Scale, X } from "lucide-react";
import { cn } from "@/src/utils/cn";
import CatalogImageFields from "@/src/components/admin/CatalogImageFields";
import type {
  AddonGroupFormFields as FormFields,
  AddonGroupFormSubmission,
} from "@/src/components/admin/addonGroupFormModel";
import { buildAddonGroupSubmission } from "@/src/components/admin/addonGroupFormModel";

function createOptionImageKey(): string {
  return `new-${crypto.randomUUID()}`;
}

interface AddonGroupFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<FormFields>;
  onSubmit: (data: AddonGroupFormSubmission) => Promise<void>;
  isSubmitting: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function AddonGroupForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
  onDirtyChange,
}: AddonGroupFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<FormFields>({
    defaultValues: {
      name: "",
      description: "",
      max_select: "1",
      is_dynamic_gram: false,
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

  const { fields, append, move, remove } = useFieldArray({
    control,
    name: "options",
    keyName: "fieldKey",
  });
  const isDynamicGram = useWatch({ control, name: "is_dynamic_gram" });
  const watchedOptions = useWatch({ control, name: "options" });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const moveOption = (from: number, to: number) => {
    const reordered = [...(watchedOptions ?? [])];
    const [selected] = reordered.splice(from, 1);
    if (!selected) return;
    reordered.splice(to, 0, selected);
    move(from, to);
    reordered.forEach((_, index) => {
      setValue(`options.${index}.sort_order`, String(index), { shouldDirty: true });
    });
  };

  const onFormSubmit = async (values: FormFields) => {
    if (values.is_active && !values.options.some((option) => option.is_active)) {
      setError("options", { message: "Nhóm đang mở phải có ít nhất một tùy chọn đang hiển thị." });
      return;
    }
    clearErrors("options");

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

    await onSubmit(buildAddonGroupSubmission(values));
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
          <label className={labelClass}>Cách tính giá *</label>
          <Controller
            name="is_dynamic_gram"
            control={control}
            render={({ field }) => (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    value: false,
                    icon: BadgeDollarSign,
                    title: "Giá cố định",
                    description: "Mỗi tùy chọn có một mức giá VND riêng.",
                  },
                  {
                    value: true,
                    icon: Scale,
                    title: "Theo gram bột",
                    description: "Giá được tính từ số gram và loại bột khách chọn.",
                  },
                ].map((choice) => {
                  const Icon = choice.icon;
                  const selected = field.value === choice.value;
                  return (
                    <button
                      key={choice.title}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        field.onChange(choice.value);
                        if (choice.value) {
                          setValue("max_select", "1", { shouldDirty: true });
                          fields.forEach((_, index) => {
                            setValue(`options.${index}.price_vnd`, "0", { shouldDirty: true });
                          });
                        } else {
                          fields.forEach((_, index) => {
                            setValue(`options.${index}.gram_value`, "", { shouldDirty: true });
                          });
                        }
                      }}
                      className={cn(
                        "flex min-h-20 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary/30",
                      )}
                    >
                      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected && "text-primary")} aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-semibold">{choice.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed">{choice.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          />
        </div>

        <div>
          <label className={labelClass}>Số tùy chọn tối đa khách được chọn *</label>
          <input
            type="number"
            min="1"
            disabled={isDynamicGram}
            {...register("max_select", {
              required: "Vui lòng nhập số lượng tối đa",
              min: { value: 1, message: "Tối thiểu là 1" },
            })}
            className={inputClass}
          />
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {isDynamicGram
              ? "Nhóm theo gram luôn chỉ cho chọn 1 mức gram."
              : "Nhóm là tùy chọn thêm; khách có thể bỏ qua hoặc chọn tối đa số lượng này."}
          </p>
          {errors.max_select && <p className={errorClass}>{errors.max_select.message}</p>}
        </div>
      </div>

      {/* ── Options List ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <div>
            <h3 className="font-semibold text-foreground">Các tùy chọn</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isDynamicGram ? "Mỗi tùy chọn là một mức gram." : "Mỗi tùy chọn có giá bán riêng."}
            </p>
          </div>
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
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Plus size={16} /> Thêm
          </button>
        </div>

        {errors.options?.message && (
          <p className={errorClass}>{errors.options.message}</p>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.fieldKey} className="relative rounded-2xl border border-border bg-card p-4 shadow-sm">
              <input type="hidden" {...register(`options.${index}.image_key`)} />
              <input type="hidden" {...register(`options.${index}.image_url`)} />
              <input type="hidden" {...register(`options.${index}.sort_order`)} />
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Tùy chọn {index + 1}</p>
                  <p className="text-xs text-muted-foreground">Thứ tự hiển thị và trạng thái được lưu riêng.</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveOption(index, index - 1)} disabled={index === 0} className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label={`Đưa tùy chọn ${index + 1} lên`}>
                    <ArrowUp size={17} />
                  </button>
                  <button type="button" onClick={() => moveOption(index, index + 1)} disabled={index === fields.length - 1} className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label={`Đưa tùy chọn ${index + 1} xuống`}>
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1 || Boolean(field.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Xóa tùy chọn ${index + 1}`}
                    title={field.id ? "Ẩn tùy chọn đã lưu bằng trạng thái Đang bán" : "Xóa tùy chọn"}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <Controller
                  name={`options.${index}.image_filename`}
                  control={control}
                  render={({ field: filenameField }) => (
                    <div>
                      <CatalogImageFields
                        currentImageUrl={field.image_url}
                        label="Ảnh tùy chọn"
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-muted-foreground">Tên tùy chọn *</label>
                  <input
                    {...register(`options.${index}.label`, { required: "Bắt buộc" })}
                    placeholder={isDynamicGram ? "Ví dụ: +2g" : "Ví dụ: Kem sữa"}
                    className={cn(inputClass, "mt-0")}
                  />
                  {errors.options?.[index]?.label && <p className={errorClass}>{errors.options[index]?.label?.message}</p>}
                  </div>

                  {isDynamicGram ? (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Số gram thêm *</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        {...register(`options.${index}.gram_value`, {
                          validate: (value) =>
                            !watchedOptions?.[index]?.is_active || Number(value) > 0 || "Gram phải lớn hơn 0",
                        })}
                        placeholder="Ví dụ: 2"
                        className={cn(inputClass, "mt-0", errors.options?.[index]?.gram_value && "border-destructive")}
                      />
                      {errors.options?.[index]?.gram_value && <p className={errorClass}>{errors.options[index]?.gram_value?.message}</p>}
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Giá cộng thêm (VND) *</label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        {...register(`options.${index}.price_vnd`, {
                          required: "Bắt buộc",
                          min: { value: 0, message: "Giá không được âm" },
                        })}
                        className={cn(inputClass, "mt-0", errors.options?.[index]?.price_vnd && "border-destructive")}
                      />
                      {errors.options?.[index]?.price_vnd && <p className={errorClass}>{errors.options[index]?.price_vnd?.message}</p>}
                    </div>
                  )}

                  <label className="col-span-2 flex min-h-10 items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                    <input
                      type="checkbox"
                      {...register(`options.${index}.is_active`)}
                      className="h-5 w-5 rounded text-primary focus:ring-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">Đang hiển thị</span>
                      <span className="block text-xs text-muted-foreground">Tắt để ẩn tùy chọn đã được sử dụng trước đây.</span>
                    </span>
                  </label>
                </div>
              </div>
              {isDynamicGram ? (
                <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Giá option gửi lên là 0; hệ thống tự tính theo số gram × giá của bột khách chọn.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between rounded-xl bg-secondary/30 px-3 py-2">
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
                className="flex h-10 w-12 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className={cn("relative h-6 w-11 rounded-full transition-colors", field.value ? "bg-primary" : "bg-border")}>
                  <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", field.value && "translate-x-5")} />
                </span>
              </button>
            )}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-10 w-full rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 sm:w-auto"
        >
          {isSubmitting ? "Đang xử lý..." : mode === "create" ? "Tạo nhóm addon" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
