"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/src/utils/cn";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";

// ── Form field types (all strings for HTML inputs) ────────────────────────────
// RHF works with raw string inputs; we parse manually on submit.

interface FormFields {
  name: string;
  description: string;
  category: "latte" | "fusion";
  is_seasonal: boolean;
  is_available: boolean;
  sort_order: string;
  // Sizes — entered as "cá" units (integer), nullable (empty = not sold)
  size_m: string;
  size_l: string;
  size_xl: string;
  // Latte only
  matcha_powder_id: string;
  // Fusion only
  default_powder_id: string;
  base_liquid_note: string;
  allowed_powder_ids: string[];
  // Custom gram overrides — unit: gram (g)
  grams_m: string;
  grams_l: string;
  grams_xl: string;
  // Inline powder creation (Latte only, create mode)
  powder_mode: "new" | "existing";
  new_powder_name: string;
  new_powder_price_per_gram: string;
  new_powder_grams_m: string;
  new_powder_grams_l: string;
  new_powder_grams_xl: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export type MenuItemFormValues = FormFields;

interface MenuItemFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<FormFields>;
  powders: Powder[];
  onSubmit: (fd: FormData) => Promise<void>;
  isSubmitting: boolean;
}

// ── Helper: build defaultValues from AdminMenuItem ─────────────────────────────

/** Build MenuItemFormValues from an existing AdminMenuItem for edit mode. */
export function buildDefaultValues(item: AdminMenuItem): MenuItemFormValues {
  const sizeMap: Record<string, number | null> = {};
  for (const s of item.sizes) sizeMap[s.size] = s.base_price_vnd;
  const cpg = item.custom_powder_grams as Record<string, number> | null;
  return {
    name: item.name,
    description: item.description ?? "",
    category: item.category,
    is_seasonal: item.is_seasonal,
    is_available: item.is_available,
    sort_order: String(item.sort_order),
    size_m: sizeMap["M"] != null ? String(sizeMap["M"]! / 1000) : "",
    size_l: sizeMap["L"] != null ? String(sizeMap["L"]! / 1000) : "",
    size_xl: sizeMap["XL"] != null ? String(sizeMap["XL"]! / 1000) : "",
    matcha_powder_id: item.matcha_powder_id ?? "",
    default_powder_id: item.default_powder_id ?? "",
    base_liquid_note: item.base_liquid_note ?? "",
    allowed_powder_ids: item.allowed_powder_ids ?? [],
    grams_m: cpg?.M != null ? String(cpg.M) : "",
    grams_l: cpg?.L != null ? String(cpg.L) : "",
    grams_xl: cpg?.XL != null ? String(cpg.XL) : "",
    powder_mode: "new",
    new_powder_name: "",
    new_powder_price_per_gram: "",
    new_powder_grams_m: "",
    new_powder_grams_l: "",
    new_powder_grams_xl: "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/** Form component cho việc tạo/sửa menu item — Phase 2 schema (latte/fusion). */
export default function MenuItemForm({
  mode,
  defaultValues,
  powders,
  onSubmit,
  isSubmitting,
}: MenuItemFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormFields>({
    defaultValues: {
      name: "",
      description: "",
      category: "latte",
      is_seasonal: false,
      is_available: true,
      sort_order: "0",
      size_m: "",
      size_l: "",
      size_xl: "",
      matcha_powder_id: "",
      default_powder_id: "",
      base_liquid_note: "",
      allowed_powder_ids: [],
      grams_m: "",
      grams_l: "",
      grams_xl: "",
      powder_mode: "new",
      new_powder_name: "",
      new_powder_price_per_gram: "",
      new_powder_grams_m: "",
      new_powder_grams_l: "",
      new_powder_grams_xl: "",
      ...defaultValues,
    },
  });

  const category = watch("category");
  const defaultPowderId = watch("default_powder_id");
  const allowedPowderIds = watch("allowed_powder_ids");
  const powderMode = watch("powder_mode");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormFields | null>(null);

  // Tự động bỏ chọn khỏi danh sách swap nếu bột đó được chọn làm default
  useEffect(() => {
    if (defaultPowderId && allowedPowderIds.includes(defaultPowderId)) {
      setValue("allowed_powder_ids", allowedPowderIds.filter(id => id !== defaultPowderId));
    }
  }, [defaultPowderId, allowedPowderIds, setValue]);

  // Hiển thị tất cả bột cho Admin, đánh dấu nếu ngưng bán
  const sortedPowders = [...powders].sort((a, b) => a.name.localeCompare(b.name));

  // Manual parse helpers
  const parseSize = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const parseGrams = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const onFormSubmit = async (values: FormFields) => {
    setFormError(null);

    // Validate: Latte requires a powder
    if (values.category === "latte" && mode === "create") {
      if (values.powder_mode === "existing" && !values.matcha_powder_id) {
        setFormError("Vui lòng chọn bột matcha cho món Latte.");
        return;
      }
      if (values.powder_mode === "new") {
        if (!values.new_powder_name.trim()) {
          setFormError("Vui lòng nhập tên bột mới.");
          return;
        }
        if (!values.new_powder_price_per_gram.trim()) {
          setFormError("Vui lòng nhập giá bột mới.");
          return;
        }
      }
    }

    // Validate: At least one size must be provided
    if (!values.size_m && !values.size_l && !values.size_xl) {
      setFormError("Vui lòng nhập giá cho ít nhất một size.");
      return;
    }

    setPendingValues(values);
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingValues) return;
    const values = pendingValues;
    setShowConfirm(false);

    const fd = new FormData();
    fd.append("name", values.name.trim());
    if (values.description.trim()) fd.append("description", values.description.trim());
    fd.append("category", values.category);
    fd.append("is_seasonal", String(values.is_seasonal));
    fd.append("is_available", String(values.is_available));
    fd.append("sort_order", String(Math.max(0, Number(values.sort_order) || 0)));

    // Sizes — convert from "cá" units to VND (* 1000)
    const sizeM = parseSize(values.size_m);
    const sizeL = parseSize(values.size_l);
    const sizeXL = parseSize(values.size_xl);
    fd.append(
      "sizes",
      JSON.stringify([
        { size: "M", base_price_vnd: sizeM != null ? sizeM * 1000 : null },
        { size: "L", base_price_vnd: sizeL != null ? sizeL * 1000 : null },
        { size: "XL", base_price_vnd: sizeXL != null ? sizeXL * 1000 : null },
      ])
    );

    // Category-specific fields
    if (values.category === "latte") {
      if (mode === "create" && values.powder_mode === "new") {
        fd.append("new_powder_name", values.new_powder_name.trim());
        fd.append("new_powder_price_per_gram", values.new_powder_price_per_gram.trim());
        
        const newPowderGmM = parseGrams(values.new_powder_grams_m);
        const newPowderGmL = parseGrams(values.new_powder_grams_l);
        const newPowderGmXL = parseGrams(values.new_powder_grams_xl);
        const powderSizeConfig = [];
        if (newPowderGmM != null) powderSizeConfig.push({ size: "M", grams: newPowderGmM });
        if (newPowderGmL != null) powderSizeConfig.push({ size: "L", grams: newPowderGmL });
        if (newPowderGmXL != null) powderSizeConfig.push({ size: "XL", grams: newPowderGmXL });
        
        if (powderSizeConfig.length > 0) {
          fd.append("new_powder_size_config", JSON.stringify(powderSizeConfig));
        }
      } else {
        if (values.matcha_powder_id) fd.append("matcha_powder_id", values.matcha_powder_id);
      }
    }
    if (values.category === "fusion") {
      if (values.default_powder_id) fd.append("default_powder_id", values.default_powder_id);
      if (values.base_liquid_note.trim()) fd.append("base_liquid_note", values.base_liquid_note.trim());
      if (values.allowed_powder_ids) fd.append("allowed_powder_ids", JSON.stringify(values.allowed_powder_ids));
    }

    // Custom gram overrides — only non-empty values
    const gmM = parseGrams(values.grams_m);
    const gmL = parseGrams(values.grams_l);
    const gmXL = parseGrams(values.grams_xl);
    const cpg: Record<string, number> = {};
    if (gmM != null) cpg.M = gmM;
    if (gmL != null) cpg.L = gmL;
    if (gmXL != null) cpg.XL = gmXL;
    if (Object.keys(cpg).length > 0) fd.append("custom_powder_grams", JSON.stringify(cpg));

    if (imageFile) fd.append("image", imageFile);

    await onSubmit(fd);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > 5 * 1024 * 1024) {
      setFormError("Ảnh quá lớn! Vui lòng chọn ảnh nhỏ hơn 5MB.");
      setImageFile(null);
      setImagePreview(null);
      e.target.value = "";
      return;
    }
    setFormError(null);
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const inputClass =
    "rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "text-sm font-medium text-foreground";
  const errorClass = "text-xs text-destructive mt-1";

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      {formError && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}

      {/* Tên món */}
      <div>
        <label className={labelClass}>Tên món *</label>
        <input
          {...register("name", { required: "Vui lòng nhập tên món" })}
          placeholder="Ví dụ: Matcha Latte"
          className={inputClass}
        />
        {errors.name && <p className={errorClass}>{errors.name.message}</p>}
      </div>

      {/* Mô tả */}
      <div>
        <label className={labelClass}>Mô tả</label>
        <textarea
          {...register("description")}
          placeholder="Mô tả ngắn về món"
          className={cn(inputClass, "min-h-[60px] resize-none")}
        />
      </div>

      {/* Danh mục — ẩn nếu edit Latte */}
      {!(mode === "edit" && category === "latte") && (
        <div>
          <label className={labelClass}>Danh mục *</label>
          <select {...register("category")} disabled={mode === "edit"} className={inputClass}>
            <option value="latte">Latte</option>
            <option value="fusion">Fusion</option>
          </select>
          {mode === "edit" && (
            <p className="text-xs text-muted-foreground mt-1">
              Danh mục không thể thay đổi sau khi tạo.
            </p>
          )}
        </div>
      )}

      {/* Giá — 3 sizes (nhập bằng cá 🐟, để trống = không bán size đó) */}
      <div>
        <label className={labelClass}>
          Giá cơ sở (🐟 cá){" "}
          <span className="text-muted-foreground font-normal">— để trống = không bán size đó</span>
        </label>
        <div className="grid grid-cols-3 gap-3 mt-1">
          {(["M", "L", "XL"] as const).map((size) => {
            const field = `size_${size.toLowerCase()}` as "size_m" | "size_l" | "size_xl";
            return (
              <div key={size}>
                <label className="text-xs text-muted-foreground">Size {size}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  {...register(field)}
                  placeholder="—"
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Latte only: Bột matcha */}
      {category === "latte" && (
        <div className="space-y-4">
          <label className={labelClass}>Bột matcha *</label>
          {mode === "edit" ? (
            <div className="px-3 py-2 bg-secondary/20 border border-border rounded-xl text-sm text-foreground">
              {sortedPowders.find(p => p.id === watch("matcha_powder_id"))?.name || "Đang tải..."}
              <p className="text-[10px] text-muted-foreground mt-0.5">Không thể đổi bột sau khi tạo (neo giá Fusion).</p>
            </div>
          ) : (
            <>
              {/* Toggle switch for Create mode */}
              <div className="flex bg-secondary/30 rounded-xl p-1">
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    powderMode === "new" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setValue("powder_mode", "new")}
                >
                  Tạo bột mới
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    powderMode === "existing" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setValue("powder_mode", "existing")}
                >
                  Chọn bột có sẵn
                </button>
              </div>

              {powderMode === "existing" && (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <select {...register("matcha_powder_id")} className={inputClass}>
                    <option value="">— Chọn bột —</option>
                    {sortedPowders
                      // Optionally, filter to only show powders without reference_latte_item_id
                      // But for now, we just list them, backend handles P2002 if taken
                      .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.type !== "NONE" ? ` (${p.type})` : ""}
                        {!p.is_available ? " (Ngưng bán)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {powderMode === "new" && (
                <div className="space-y-3 bg-secondary/10 p-3 rounded-xl border border-border/50 animate-in fade-in zoom-in-95 duration-200">
                  <div>
                    <label className="text-xs text-muted-foreground">Tên bột *</label>
                    <input
                      {...register("new_powder_name")}
                      placeholder="Ví dụ: Meyumi"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Giá (VND/gram) *</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      {...register("new_powder_price_per_gram")}
                      placeholder="Ví dụ: 6000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Gram bột riêng <span className="font-normal">— để trống = hệ thống</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {(["M", "L", "XL"] as const).map((size) => {
                        const field = `new_powder_grams_${size.toLowerCase()}` as "new_powder_grams_m" | "new_powder_grams_l" | "new_powder_grams_xl";
                        return (
                          <div key={size}>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              {...register(field)}
                              placeholder={`Size ${size}`}
                              className={cn(inputClass, "text-xs px-2")}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Fusion only */}
      {category === "fusion" && (
        <>
          <div>
            <label className={labelClass}>Bột mặc định</label>
            <select {...register("default_powder_id")} className={inputClass}>
              <option value="">— Tự động (Meyumi → Hana → MH-3 → rẻ nhất) —</option>
              {sortedPowders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.type !== "NONE" ? ` (${p.type})` : ""}
                  {!p.is_available ? " (Ngưng bán)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Các bột cho phép swap</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {sortedPowders
                .filter((p) => p.id !== defaultPowderId)
                .map((p) => (
                  <label
                    key={p.id}
                    className={cn("flex items-center space-x-2 text-sm", !p.is_available && "opacity-60")}
                  >
                    <input
                      type="checkbox"
                      value={p.id}
                      {...register("allowed_powder_ids")}
                      className="rounded border-border text-primary focus:ring-primary/40"
                    />
                    <span>
                      {p.name}
                      {!p.is_available && <span className="text-[10px] ml-1 opacity-70">(Ngưng bán)</span>}
                    </span>
                  </label>
                ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Base liquid</label>
            <input
              {...register("base_liquid_note")}
              placeholder="Ví dụ: Nước ép cam, Milk foam"
              className={inputClass}
            />
          </div>
        </>
      )}

      {/* Custom gram override — label unit: gram (g) */}
      <div>
        <label className={labelClass}>
          Gram bột tuỳ chỉnh{" "}
          <span className="text-muted-foreground font-normal">
            gram (g) — để trống = dùng cấu hình hệ thống
          </span>
        </label>
        <div className="grid grid-cols-3 gap-3 mt-1">
          {(["M", "L", "XL"] as const).map((size) => {
            const field = `grams_${size.toLowerCase()}` as "grams_m" | "grams_l" | "grams_xl";
            return (
              <div key={size}>
                <label className="text-xs text-muted-foreground">Size {size} (g)</label>
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

      {/* Ảnh */}
      <div>
        <label className={labelClass}>Ảnh sản phẩm</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImageChange}
          className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-secondary/40 file:text-sm file:font-medium hover:file:bg-secondary/60"
        />
        {imagePreview && (
          <img
            src={imagePreview}
            alt="Preview"
            className="mt-2 h-20 w-20 rounded-xl object-cover border border-border"
          />
        )}
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        {(
          [
            { name: "is_seasonal", label: "Theo mùa" },
            { name: "is_available", label: "Đang bán" },
          ] as const
        ).map(({ name, label }) => (
          <div
            key={name}
            className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2"
          >
            <label className={labelClass}>{label}</label>
            <Controller
              name={name}
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
        ))}
      </div>

      {/* Sort order */}
      <div>
        <label className={labelClass}>Thứ tự hiển thị</label>
        <input
          type="number"
          min="0"
          step="1"
          {...register("sort_order")}
          placeholder="0"
          className={inputClass}
        />
      </div>

      {/* Submit */}
      <div className="flex gap-2 justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
        >
          {isSubmitting ? "Đang xử lý..." : mode === "create" ? "Thêm món" : "Cập nhật"}
        </button>
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-serif font-bold text-xl text-foreground mb-2">Xác nhận</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Bạn có chắc chắn muốn {mode === "create" ? "thêm món này" : "cập nhật thay đổi"} không?
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
