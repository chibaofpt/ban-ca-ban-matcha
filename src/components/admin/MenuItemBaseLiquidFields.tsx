import type { UseFormRegisterReturn } from "react-hook-form";
import type { Category, MilkTypeOption, Size } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";

interface VolumeFieldsProps {
  defaultSizeConfig: Array<{ size: Size; base_liquid_ml: number }>;
  registrations: Record<Size, UseFormRegisterReturn>;
  inputClass: string;
  labelClass: string;
}

/** Render per-size Base Liquid volume overrides with system fallback hints. */
export function MenuItemBaseLiquidVolumeFields({
  defaultSizeConfig,
  registrations,
  inputClass,
  labelClass,
}: VolumeFieldsProps) {
  const labelMap: Record<Size, string> = { SMALL: "S", MEDIUM: "M", LARGE: "L" };
  return (
    <div className="pt-3 border-t border-border/40">
      <label className={labelClass}>Định lượng Base Liquid theo size (ml)</label>
      <p className="text-[11px] text-muted-foreground mt-1">
        Để trống để kế thừa định lượng hệ thống. Size không bán không tham gia tính giá.
      </p>
      <div className="grid grid-cols-3 gap-3 mt-3">
        {(["SMALL", "MEDIUM", "LARGE"] as const).map((size) => {
          const systemMl = defaultSizeConfig.find((entry) => entry.size === size)?.base_liquid_ml ?? 0;
          return (
            <div key={size}>
              <label className="text-[11px] font-bold text-muted-foreground">{labelMap[size]}</label>
              <input
                type="number"
                min="1"
                step="1"
                {...registrations[size]}
                placeholder={`${systemMl} ml hệ thống`}
                className={inputClass}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ConfigFieldsProps {
  category: Category;
  baseLiquids: MilkTypeOption[];
  defaultBaseLiquidId: string;
  allowedBaseLiquidIds: string[];
  defaultRegistration: UseFormRegisterReturn;
  registerAllowed: () => UseFormRegisterReturn;
  defaultError?: string;
  inputClass: string;
  labelClass: string;
  errorClass: string;
}

/** Render per-item Base Liquid default and allow-list controls. */
export function MenuItemBaseLiquidFields({
  category,
  baseLiquids,
  defaultBaseLiquidId,
  allowedBaseLiquidIds,
  defaultRegistration,
  registerAllowed,
  defaultError,
  inputClass,
  labelClass,
  errorClass,
}: ConfigFieldsProps) {
  const activeLiquids = baseLiquids.filter((liquid) => liquid.is_active !== false);
  const globalDefault = activeLiquids.find((liquid) => liquid.is_default);
  const resolvedDefaultId = category === "latte" ? globalDefault?.id : defaultBaseLiquidId;

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Base Liquid mặc định</label>
        {category === "latte" ? (
          <div className="mt-1 rounded-xl border border-border bg-secondary/20 px-3 py-3 text-sm">
            {globalDefault?.name ?? "Chưa cấu hình mặc định hệ thống"}
            <p className="mt-1 text-[11px] text-muted-foreground">Latte luôn dùng mặc định toàn hệ thống.</p>
          </div>
        ) : (
          <>
            <select
              {...defaultRegistration}
              className={cn(inputClass, defaultError && "border-destructive")}
            >
              <option value="">— Chọn Base Liquid mặc định —</option>
              {activeLiquids.map((liquid) => (
                <option key={liquid.id} value={liquid.id}>{liquid.name}</option>
              ))}
            </select>
            {defaultError && <p className={errorClass}>{defaultError}</p>}
          </>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass}>
            {category === "latte" ? "Các loại sữa được đổi" : "Base Liquid được đổi"}
          </label>
          <span className="text-[10px] text-muted-foreground">Đã chọn {allowedBaseLiquidIds.length}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-secondary/10 p-3">
          {activeLiquids
            .filter((liquid) => liquid.id !== resolvedDefaultId)
            .map((liquid) => (
              <label key={liquid.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-background">
                <input
                  type="checkbox"
                  value={liquid.id}
                  {...registerAllowed()}
                  className="rounded border-border text-primary focus:ring-primary/40"
                />
                <span className="truncate">{liquid.name}</span>
              </label>
            ))}
        </div>
      </div>
    </div>
  );
}
