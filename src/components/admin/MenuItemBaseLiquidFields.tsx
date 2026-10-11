import { Fragment, useId, useState } from "react";
import { motion } from "framer-motion";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { Category, MilkTypeOption, Size } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";
import { SizeLabel } from "@/src/components/ui/SizeLabel";

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
              <label className="text-[11px] font-bold text-muted-foreground"><SizeLabel size={size} /></label>
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
  mode: "create" | "edit";
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
  mode,
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
  const inactiveLiquids = baseLiquids.filter((liquid) => liquid.is_active === false);
  const inactiveDefault = inactiveLiquids.find((liquid) => liquid.id === defaultBaseLiquidId);
  const inactiveSwapLiquids = inactiveLiquids.filter((liquid) => liquid.id !== resolvedDefaultId);
  const [showInactive, setShowInactive] = useState(false);
  const [inactiveToggleTouched, setInactiveToggleTouched] = useState(false);
  const hasSelectedInactiveSwap = inactiveSwapLiquids.some((liquid) =>
    allowedBaseLiquidIds.includes(liquid.id),
  );
  const showInactiveRows = showInactive || (!inactiveToggleTouched && hasSelectedInactiveSwap);
  const inactiveDefaultOptions =
    mode === "edit" && showInactiveRows
      ? inactiveLiquids
      : inactiveDefault
        ? [inactiveDefault]
        : [];
  const selectableDefaultLiquids = [...activeLiquids, ...inactiveDefaultOptions];
  const inactivePanelId = "base-liquid-inactive-" + useId().replace(/:/g, "");
  const inactiveSelectedCount = inactiveSwapLiquids.filter((liquid) =>
    allowedBaseLiquidIds.includes(liquid.id),
  ).length;
  const selectableSwapLiquids = [
    ...activeLiquids.filter((liquid) => liquid.id !== resolvedDefaultId),
    ...inactiveSwapLiquids,
  ];

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
              {selectableDefaultLiquids.map((liquid) => (
                <option key={liquid.id} value={liquid.id}>
                  {liquid.name}{liquid.is_active === false ? " (Ngưng hoạt động)" : ""}
                </option>
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
        <div
          id={inactivePanelId}
          className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-secondary/10 p-3"
        >
          {selectableSwapLiquids.map((liquid) => {
            const isInactive = liquid.is_active === false;
            return (
              <Fragment key={liquid.id}>
                {isInactive && liquid.id === inactiveSwapLiquids[0]?.id && (
                  <motion.h4
                    initial={false}
                    animate={{ display: showInactiveRows ? "block" : "none", opacity: showInactiveRows ? 1 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="col-span-full mt-2 border-t border-border/60 pt-3 text-xs font-semibold text-muted-foreground"
                  >
                    Tạm ngưng
                  </motion.h4>
                )}
              <motion.label
                initial={false}
                animate={isInactive ? {
                  display: showInactiveRows ? "flex" : "none",
                  opacity: showInactiveRows ? 1 : 0,
                  y: showInactiveRows ? 0 : -4,
                } : undefined}
                transition={{ duration: 0.2 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 text-sm hover:bg-background",
                  isInactive && "border-border/70 bg-muted/50",
                )}
              >
                <input
                  type="checkbox"
                  value={liquid.id}
                  {...registerAllowed()}
                  className="shrink-0 rounded border-border text-primary focus:ring-primary/40"
                />
                <span className="min-w-0 truncate text-foreground">{liquid.name}</span>
              </motion.label>
              </Fragment>
            );
          })}
        </div>
        {inactiveLiquids.length > 0 && (
          <motion.button
            type="button"
            aria-expanded={showInactiveRows}
            aria-controls={inactivePanelId}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              setInactiveToggleTouched(true);
              setShowInactive(!showInactiveRows);
            }}
            className="mt-2 min-h-9 rounded-lg px-2 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span>
              {showInactiveRows
                ? "Ẩn Base Liquid ngưng hoạt động"
                : "Hiện thêm " + inactiveLiquids.length + " Base Liquid ngưng hoạt động"}
            </span>{" "}
            <span className="text-[10px] text-foreground">
              (Đã chọn {inactiveSelectedCount})
            </span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
