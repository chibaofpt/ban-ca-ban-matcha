"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/src/utils/cn";
import type { Powder, PowderType } from "@/src/lib/types/powder";
import type { AdminMenuItem } from "@/src/lib/types/menu";

// Form field types matching updatePowderSchema
interface FormFields {
  name: string;
  manufacturer: string;
  description: string;
  price_per_gram: string; // Parse to number on submit
  type: PowderType;
  reference_latte_item_id: string;
  
  fragrance: string;
  body: string;
  bitterness: string;
  umami: string;
  color: string;
  
  is_available: boolean;
  
  grams_m: string;
  grams_l: string;
  grams_xl: string;
}

interface PowderFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<FormFields>;
  latteItems: AdminMenuItem[];
  onSubmit: (data: any) => Promise<void>;
  isSubmitting: boolean;
}

export function buildPowderDefaultValues(item: Powder): Partial<FormFields> {
  const sizeMap: Record<string, number> = {};
  for (const s of item.size_config || []) sizeMap[s.size] = s.grams;
  
  return {
    name: item.name,
    manufacturer: item.manufacturer ?? "",
    description: item.description ?? "",
    price_per_gram: String(item.price_per_gram),
    type: item.type,
    reference_latte_item_id: item.reference_latte_item_id ?? "",
    fragrance: item.fragrance != null ? String(item.fragrance) : "",
    body: item.body != null ? String(item.body) : "",
    bitterness: item.bitterness != null ? String(item.bitterness) : "",
    umami: item.umami != null ? String(item.umami) : "",
    color: item.color != null ? String(item.color) : "",
    is_available: item.is_available,
    grams_m: sizeMap["M"] != null ? String(sizeMap["M"]) : "",
    grams_l: sizeMap["L"] != null ? String(sizeMap["L"]) : "",
    grams_xl: sizeMap["XL"] != null ? String(sizeMap["XL"]) : "",
  };
}

export default function PowderForm({
  mode,
  defaultValues,
  latteItems,
  onSubmit,
  isSubmitting,
}: PowderFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormFields>({
    defaultValues: {
      name: "",
      manufacturer: "",
      description: "",
      price_per_gram: "",
      type: "NONE",
      reference_latte_item_id: "",
      fragrance: "",
      body: "",
      bitterness: "",
      umami: "",
      color: "",
      is_available: true,
      grams_m: "",
      grams_l: "",
      grams_xl: "",
      ...defaultValues,
    },
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormFields | null>(null);

  const parseNum = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const onFormSubmit = async (values: FormFields) => {
    setFormError(null);
    setPendingValues(values);
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingValues) return;
    const values = pendingValues;
    setShowConfirm(false);

    const price = parseNum(values.price_per_gram);
    if (price == null || price < 0) {
      setFormError("Giá trị VND/g không hợp lệ.");
      return;
    }

    const payload: any = {
      name: values.name.trim(),
      manufacturer: values.manufacturer.trim(),
      description: values.description.trim() || null,
      price_per_gram: Math.round(price),
      type: values.type,
      reference_latte_item_id: values.reference_latte_item_id || null,
      fragrance: parseNum(values.fragrance),
      body: parseNum(values.body),
      bitterness: parseNum(values.bitterness),
      umami: parseNum(values.umami),
      color: parseNum(values.color),
      is_available: values.is_available,
    };

    const size_config = [];
    const gM = parseNum(values.grams_m);
    const gL = parseNum(values.grams_l);
    const gXL = parseNum(values.grams_xl);
    if (gM != null && gM > 0) size_config.push({ size: "SMALL", grams: gM });
    if (gL != null && gL > 0) size_config.push({ size: "MEDIUM", grams: gL });
    if (gXL != null && gXL > 0) size_config.push({ size: "LARGE", grams: gXL });
    
    payload.size_config = size_config;

    await onSubmit(payload);
  };

  const inputClass =
    "rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 disabled:opacity-50";
  const labelClass = "text-sm font-medium text-foreground";
  const errorClass = "text-xs text-destructive mt-1";

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
      {formError && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Tên bột *</label>
          <input
            {...register("name", { required: "Vui lòng nhập tên bột" })}
            placeholder="Ví dụ: Meyumi, Hana..."
            className={inputClass}
          />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelClass}>Nhà sản xuất *</label>
          <input
            {...register("manufacturer", { required: "Vui lòng nhập nhà sản xuất" })}
            placeholder="Ví dụ: Uji, Kyoto"
            className={inputClass}
          />
          {errors.manufacturer && <p className={errorClass}>{errors.manufacturer.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Giá bán (VND/gram) *</label>
            <input
              type="number"
              min="0"
              step="1"
              {...register("price_per_gram", { required: "Vui lòng nhập giá" })}
              placeholder="Ví dụ: 6000"
              className={inputClass}
            />
            {errors.price_per_gram && <p className={errorClass}>{errors.price_per_gram.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Loại thẻ (Badge)</label>
            <select {...register("type")} className={inputClass}>
              <option value="NONE">Không có</option>
              <option value="RECOMMEND">Khuyên dùng (Recommend)</option>
              <option value="NEW">Mới (New)</option>
              <option value="SEASONAL">Theo mùa (Seasonal)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Mô tả</label>
          <textarea
            {...register("description")}
            placeholder="Mô tả hương vị..."
            className={cn(inputClass, "min-h-[60px] resize-none")}
          />
        </div>
      </div>

      {/* Reference Latte Item */}
      <div className="pt-2 border-t border-border">
        <label className={labelClass}>Neo giá Fusion (Reference Latte Item)</label>
        <p className="text-[10px] text-muted-foreground mt-0.5 mb-1 leading-snug">
          Tính Premium Latte cho Fusion: Giá Latte dùng bột này trừ đi Giá Latte dùng bột mặc định.
        </p>
        <select {...register("reference_latte_item_id")} className={inputClass}>
          <option value="">— Không neo giá (Premium = 0) —</option>
          {latteItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {/* Exceptions - Size Config */}
      <div className="pt-2 border-t border-border">
        <label className={labelClass}>
          Định lượng riêng (gram){" "}
          <span className="text-muted-foreground font-normal">
            — để trống = dùng cấu hình hệ thống
          </span>
        </label>
        <div className="grid grid-cols-3 gap-3 mt-1">
          {(["SMALL", "MEDIUM", "LARGE"] as const).map((size) => {
            const gramsFieldMap = { SMALL: "grams_m", MEDIUM: "grams_l", LARGE: "grams_xl" } as const;
            const field = gramsFieldMap[size];
            return (
              <div key={size}>
                <label className="text-xs text-muted-foreground">Size {size}</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  {...register(field)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Radar Stats */}
      <div className="pt-2 border-t border-border">
        <label className={labelClass}>Chỉ số hương vị (1 - 5)</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
          {[
            { id: "fragrance", label: "Hương (Fragrance)" },
            { id: "body", label: "Đậm (Body)" },
            { id: "bitterness", label: "Đắng (Bitterness)" },
            { id: "umami", label: "Ngọt thịt (Umami)" },
            { id: "color", label: "Màu (Color)" },
          ].map(({ id, label }) => (
            <div key={id}>
              <label className="text-xs text-muted-foreground">{label}</label>
              <input
                type="number"
                min="1"
                max="5"
                step="1"
                {...register(id as any)}
                placeholder="—"
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2">
          <label className={labelClass}>Đang mở bán</label>
          <Controller
            name="is_available"
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

      {/* Submit */}
      <div className="flex gap-2 justify-end pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
        >
          {isSubmitting ? "Đang xử lý..." : mode === "create" ? "Thêm bột" : "Cập nhật"}
        </button>
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-serif font-bold text-xl text-foreground mb-2">Xác nhận</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Bạn có chắc chắn muốn {mode === "create" ? "thêm bột này" : "cập nhật bột này"} không?
              {mode === "edit" && " Thay đổi giá hoặc định lượng gram sẽ lập tức thay đổi giá của tất cả món dùng bột này!"}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-xl font-medium text-sm text-foreground hover:bg-secondary transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
