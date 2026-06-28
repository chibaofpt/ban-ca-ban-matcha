"use client";

import { useForm, Controller } from "react-hook-form";
import { cn } from "@/src/utils/cn";
import type { AdminMilkType } from "@/src/lib/types/milkType";

interface FormFields {
  name: string;
  price_per_ml: string;
  is_default: boolean;
  is_active: boolean;
}

interface MilkTypeFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<FormFields>;
  onSubmit: (data: any) => Promise<void>;
  isSubmitting: boolean;
}

export function buildMilkTypeDefaultValues(item: AdminMilkType): Partial<FormFields> {
  return {
    name: item.name,
    price_per_ml: String(item.price_per_ml),
    is_default: item.is_default,
    is_active: item.is_active,
  };
}

export default function MilkTypeForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
}: MilkTypeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormFields>({
    defaultValues: {
      name: "",
      price_per_ml: "",
      is_default: false,
      is_active: true,
      ...defaultValues,
    },
  });

  const onFormSubmit = async (values: FormFields) => {
    const payload = {
      name: values.name.trim(),
      price_per_ml: Number(values.price_per_ml),
      is_default: values.is_default,
      is_active: values.is_active,
    };
    await onSubmit(payload);
  };

  const inputClass =
    "rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 disabled:opacity-50";
  const labelClass = "text-sm font-medium text-foreground";
  const errorClass = "text-xs text-destructive mt-1";

  // Prevent user from unchecking is_default if they are editing the current default
  const isEditingDefault = mode === "edit" && defaultValues?.is_default;

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div>
        <label className={labelClass}>Tên loại sữa *</label>
        <input
          {...register("name", { required: "Vui lòng nhập tên" })}
          placeholder="Ví dụ: Sữa bò tươi, Sữa yến mạch..."
          className={inputClass}
        />
        {errors.name && <p className={errorClass}>{errors.name.message}</p>}
      </div>

      <div>
        <label className={labelClass}>Giá bán (VND / ml) *</label>
        <input
          type="number"
          min="0"
          step="1"
          {...register("price_per_ml", { required: "Vui lòng nhập giá" })}
          placeholder="Ví dụ: 30"
          className={inputClass}
        />
        {errors.price_per_ml && <p className={errorClass}>{errors.price_per_ml.message}</p>}
      </div>

      <div className="pt-2 border-t border-border">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register("is_default")}
            disabled={isEditingDefault}
            className="w-4 h-4 rounded text-primary focus:ring-primary disabled:opacity-50"
          />
          <div className="flex flex-col">
            <span className={cn(labelClass, isEditingDefault && "opacity-50")}>Sữa mặc định</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Loại sữa được chọn mặc định cho Latte. Các sữa khác sẽ tính giá chênh lệch.
            </span>
          </div>
        </label>
      </div>

      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2">
          <label className={labelClass}>Đang mở bán</label>
          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <button
                type="button"
                role="switch"
                aria-checked={field.value}
                disabled={isEditingDefault}
                onClick={() => {
                  if (isEditingDefault) return;
                  field.onChange(!field.value);
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 rounded-full transition disabled:opacity-50",
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
          className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
        >
          {isSubmitting ? "Đang xử lý..." : mode === "create" ? "Thêm loại sữa" : "Cập nhật"}
        </button>
      </div>
    </form>
  );
}
