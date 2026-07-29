"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { cn } from "@/src/utils/cn";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import MenuImageCropField from "@/src/components/admin/MenuImageCropField";

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
  onCancel: () => void;
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
  onCancel,
}: MenuItemFormProps) {
  const {
    register,
    handleSubmit,
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

  const category = useWatch({ control, name: "category" });
  const defaultPowderId = useWatch({ control, name: "default_powder_id" });
  const allowedPowderIds = useWatch({ control, name: "allowed_powder_ids" });
  const powderMode = useWatch({ control, name: "powder_mode" });
  const matchaPowderId = useWatch({ control, name: "matcha_powder_id" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormFields | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

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
        { size: "SMALL", base_price_vnd: sizeM != null ? sizeM * 1000 : null },
        { size: "MEDIUM", base_price_vnd: sizeL != null ? sizeL * 1000 : null },
        { size: "LARGE", base_price_vnd: sizeXL != null ? sizeXL * 1000 : null },
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
        if (newPowderGmM != null) powderSizeConfig.push({ size: "SMALL", grams: newPowderGmM });
        if (newPowderGmL != null) powderSizeConfig.push({ size: "MEDIUM", grams: newPowderGmL });
        if (newPowderGmXL != null) powderSizeConfig.push({ size: "LARGE", grams: newPowderGmXL });
        
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

  const inputClass =
    "rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "text-sm font-medium text-foreground";
  const errorClass = "text-xs text-destructive mt-1";

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 custom-scrollbar space-y-6">
        {formError && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive font-medium">
            {formError}
          </div>
        )}

        {/* Category Toggle */}
        <div>
          <label className={labelClass}>Loại món</label>
          <div className="flex bg-secondary/30 rounded-xl p-1.5 mt-1 border border-border/50">
            <button
              type="button"
              disabled={mode === "edit"}
              onClick={() => setValue("category", "latte")}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2",
                category === "latte" ? "bg-background shadow-sm text-emerald-600" : "text-muted-foreground hover:text-foreground",
                mode === "edit" && "opacity-60 cursor-not-allowed"
              )}
            >
              🍵 Latte
            </button>
            <button
              type="button"
              disabled={mode === "edit"}
              onClick={() => setValue("category", "fusion")}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2",
                category === "fusion" ? "bg-background shadow-sm text-violet-600" : "text-muted-foreground hover:text-foreground",
                mode === "edit" && "opacity-60 cursor-not-allowed"
              )}
            >
              🍹 Fusion
            </button>
          </div>
          {mode === "edit" && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Danh mục không thể thay đổi sau khi tạo.
            </p>
          )}
        </div>

        {/* Thông tin cơ bản */}
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tên món <span className="text-destructive">*</span></label>
            <input
              {...register("name", { required: "Vui lòng nhập tên món" })}
              placeholder="Ví dụ: Matcha Latte"
              className={inputClass}
            />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Mô tả</label>
            <textarea
              {...register("description")}
              placeholder="Mô tả ngắn về thành phần, hương vị..."
              className={cn(inputClass, "min-h-[80px] resize-none")}
            />
          </div>

          <MenuImageCropField
            hasExistingImage={mode === "edit" && Boolean(defaultValues?.name)}
            onFileChange={setImageFile}
            onError={setFormError}
          />
        </div>

        <div className="w-full h-px bg-border/50" />

        {/* Định giá */}
        <div className="space-y-4">
          <label className={labelClass}>
            Giá cơ sở (🐟 cá)
            <span className="text-muted-foreground font-normal ml-2 text-xs opacity-80">— Bỏ trống nếu không bán size tương ứng</span>
          </label>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {(["SMALL", "MEDIUM", "LARGE"] as const).map((size) => {
              const sizeFieldMap = { SMALL: "size_m", MEDIUM: "size_l", LARGE: "size_xl" } as const;
              const sizeLabel = { SMALL: "S", MEDIUM: "M", LARGE: "L" } as const;
              const field = sizeFieldMap[size];
              return (
                <div key={size} className="text-center">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                    {sizeLabel[size]}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    {...register(field)}
                    placeholder="—"
                    className={cn(inputClass, "text-center font-medium")}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full h-px bg-border/50" />

        {/* Cấu hình Bột Matcha */}
        <div>
          {category === "latte" && (
            <div className="space-y-4">
              <label className={labelClass}>Bột matcha cố định <span className="text-destructive">*</span></label>
              {mode === "edit" ? (
                <div className="px-4 py-3 bg-secondary/30 border border-border rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    🍵
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {sortedPowders.find(p => p.id === matchaPowderId)?.name || "Đang tải..."}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Bột không thể đổi sau khi tạo món để đảm bảo cấu trúc giá trị.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex bg-secondary/30 rounded-xl p-1 w-full md:w-max">
                    <button
                      type="button"
                      className={cn(
                        "flex-1 md:flex-none md:w-36 py-1.5 text-sm font-medium rounded-lg transition-all duration-200",
                        powderMode === "new" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setValue("powder_mode", "new")}
                    >
                      Tạo bột mới
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex-1 md:flex-none md:w-36 py-1.5 text-sm font-medium rounded-lg transition-all duration-200",
                        powderMode === "existing" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setValue("powder_mode", "existing")}
                    >
                      Chọn có sẵn
                    </button>
                  </div>

                  {powderMode === "existing" && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                      <select {...register("matcha_powder_id")} className={inputClass}>
                        <option value="">— Chọn bột từ danh sách —</option>
                        {sortedPowders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.type !== "NONE" ? `(${p.type})` : ""} {!p.is_available ? "(Ngưng bán)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {powderMode === "new" && (
                    <div className="space-y-4 bg-secondary/10 p-4 rounded-xl border border-border/50 animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-foreground mb-1 block">Tên bột mới <span className="text-destructive">*</span></label>
                          <input
                            {...register("new_powder_name")}
                            placeholder="Ví dụ: Meyumi Premium"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-foreground mb-1 block">Giá (VND/gram) <span className="text-destructive">*</span></label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            {...register("new_powder_price_per_gram")}
                            placeholder="Ví dụ: 6000"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {category === "fusion" && (
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Bột mặc định</label>
                <select {...register("default_powder_id")} className={inputClass}>
                  <option value="">— Tự động (Meyumi → Hana → MH-3 → rẻ nhất) —</option>
                  {sortedPowders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.type !== "NONE" ? `(${p.type})` : ""} {!p.is_available ? "(Ngưng bán)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-primary/60"></span>
                  Hệ thống tự fallback nếu để trống.
                </p>
              </div>

              <div>
                <label className={labelClass}>Base liquid (Dung dịch nền)</label>
                <input
                  {...register("base_liquid_note")}
                  placeholder="Ví dụ: Nước ép cam, Trà nhài..."
                  className={inputClass}
                />
              </div>

              <div className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between mb-3">
                  <label className={labelClass}>Bột cho phép Swap</label>
                  <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                    Đã chọn {allowedPowderIds.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-secondary/10 p-3 rounded-xl border border-border/40">
                  {sortedPowders
                    .filter((p) => p.id !== defaultPowderId)
                    .map((p) => (
                      <label
                        key={p.id}
                        className={cn(
                          "flex items-center space-x-2 text-sm p-2 rounded-lg hover:bg-background transition-colors cursor-pointer border border-transparent hover:border-border/60", 
                          !p.is_available && "opacity-50 grayscale"
                        )}
                      >
                        <input
                          type="checkbox"
                          value={p.id}
                          {...register("allowed_powder_ids")}
                          className="rounded border-border text-primary focus:ring-primary/40"
                        />
                        <span className="truncate">
                          {p.name}
                        </span>
                      </label>
                    ))}
                  {sortedPowders.filter((p) => p.id !== defaultPowderId).length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-full py-2 text-center">Không có bột khả dụng</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-border/50" />

        {/* Cài đặt hiển thị (Mùa vụ) */}
        <div className="flex items-center justify-between bg-amber-500/10 rounded-xl px-4 py-3 border border-amber-500/20">
          <div>
            <label className="text-sm font-semibold text-amber-900 block">Món theo mùa</label>
            <span className="text-[11px] text-amber-700/80">Đánh dấu nổi bật món chỉ bán theo mùa vụ</span>
          </div>
          <Controller
            name="is_seasonal"
            control={control}
            render={({ field }) => (
              <button
                type="button"
                role="switch"
                aria-checked={field.value}
                onClick={() => field.onChange(!field.value)}
                className={cn(
                  "relative inline-flex h-6 w-11 rounded-full transition-colors duration-200",
                  field.value ? "bg-amber-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 m-0.5",
                    field.value ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            )}
          />
        </div>

        {/* Advanced Settings Accordion */}
        <div className="border border-border/60 rounded-2xl overflow-hidden bg-card/50">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="w-full flex items-center justify-between px-5 py-4 bg-secondary/10 hover:bg-secondary/30 transition-colors"
          >
            <span className="text-sm font-semibold text-muted-foreground">Cài đặt nâng cao</span>
            {isAdvancedOpen ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
          </button>
          
          {isAdvancedOpen && (
            <div className="p-5 space-y-6 animate-in slide-in-from-top-2 duration-200 border-t border-border/50">
              {/* Custom Grams for Item */}
              <div>
                <label className="text-xs font-medium text-foreground block">
                  Định lượng bột tuỳ chỉnh cho Món (g)
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">Bỏ trống sẽ dùng cấu hình mặc định của hệ thống.</p>
                <div className="grid grid-cols-3 gap-3">
                  {(["SMALL", "MEDIUM", "LARGE"] as const).map((size) => {
                    const gramsFieldMap = { SMALL: "grams_m", MEDIUM: "grams_l", LARGE: "grams_xl" } as const;
                    const sizeLabel = { SMALL: "S", MEDIUM: "M", LARGE: "L" } as const;
                    const field = gramsFieldMap[size];
                    return (
                      <div key={size} className="text-center">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                          {sizeLabel[size]}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          {...register(field)}
                          placeholder="—"
                          className={cn(inputClass, "text-center text-xs")}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Grams for New Powder */}
              {category === "latte" && powderMode === "new" && mode === "create" && (
                <div className="pt-4 border-t border-border/50">
                  <label className="text-xs font-medium text-foreground block">
                    Định lượng chuẩn của Bột mới (g)
                  </label>
                  <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">Ghi đè cấu hình hệ thống cho riêng loại bột này.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(["SMALL", "MEDIUM", "LARGE"] as const).map((size) => {
                      const npGramsFieldMap = { SMALL: "new_powder_grams_m", MEDIUM: "new_powder_grams_l", LARGE: "new_powder_grams_xl" } as const;
                      const sizeLabel = { SMALL: "S", MEDIUM: "M", LARGE: "L" } as const;
                      const field = npGramsFieldMap[size];
                      return (
                        <div key={size} className="text-center">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                            {sizeLabel[size]}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            {...register(field)}
                            placeholder="—"
                            className={cn(inputClass, "text-center text-xs")}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sort order */}
              <div className="pt-4 border-t border-border/50">
                <label className="text-xs font-medium text-foreground block mb-1">Thứ tự hiển thị (Sort Order)</label>
                <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">Số càng nhỏ ưu tiên hiển thị trước.</p>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    {...register("sort_order")}
                    placeholder="0"
                    className={cn(inputClass, "pl-10")}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <span className="text-sm">#</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="bg-background border-t border-border/50 px-6 py-4 flex gap-3 justify-end shrink-0 mt-auto">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-xl text-sm font-medium border border-border bg-background hover:bg-secondary/60 transition-colors disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Đang lưu...
            </>
          ) : (
             mode === "create" ? "Tạo món" : "Lưu thay đổi"
          )}
        </button>
      </div>

      {/* Confirm Dialog Layer */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-border/50">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
              <span className="text-2xl">✨</span>
            </div>
            <h3 className="font-serif font-bold text-xl text-foreground mb-2">Xác nhận lưu</h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Bạn có chắc chắn muốn {mode === "create" ? "thêm món mới này vào menu" : "cập nhật các thay đổi cho món này"} không?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm text-foreground hover:bg-secondary/60 transition-colors border border-transparent hover:border-border"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-sm"
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
