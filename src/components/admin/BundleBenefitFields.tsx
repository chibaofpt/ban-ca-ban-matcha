"use client";

import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import { useFormContext, type FieldPath } from "react-hook-form";
import { BundleSharedScopeEditor } from "@/src/components/admin/BundleSharedScopeEditor";
import type { VoucherDraft } from "@/src/lib/utils/adminVoucherForm";
import type { BundleMenuConfig } from "@/src/lib/utils/adminVoucherBundle";
import type { AdaptiveSelectOption } from "@/src/lib/utils/adaptiveSelect";

const inputClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary";

function QuantityField({ label, value, onChange, disabled = false, error, onBlur }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; error?: string; onBlur?: () => void }) {
  return <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{label}</span><input type="number" min={1} value={value} disabled={disabled} onBlur={onBlur} onChange={(event) => onChange(Number(event.target.value) || 1)} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 ${error ? "border-destructive" : ""}`} />{error ? <span className="text-xs text-destructive">{error}</span> : null}</label>;
}

/** Render complete Admin BUNDLE benefit setup with per-product scope editors. */
export function BundleBenefitFields({ draft, update, menuItems, addonOptions, powderOptions, milkOptions }: {
  draft: VoucherDraft;
  update: <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => void;
  menuItems: BundleMenuConfig[];
  addonOptions: AdaptiveSelectOption[];
  powderOptions: AdaptiveSelectOption[];
  milkOptions: AdaptiveSelectOption[];
}) {
  const form = useFormContext<VoucherDraft>();
  const errorForPath = (path: string): string | undefined => {
    let current: unknown = form.formState.errors;
    for (const segment of path.split(".")) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    if (typeof current !== "object" || current === null) return undefined;
    const message = (current as Record<string, unknown>).message;
    return typeof message === "string" ? message : undefined;
  };
  const trigger = (path: string) => { void form.trigger(path as FieldPath<VoucherDraft>); };
  return <div className="min-w-0 space-y-4 overflow-x-clip">
    <div className="grid min-w-0 grid-cols-2 gap-3"><QuantityField label="Mua X món" value={draft.buyQuantity} error={errorForPath("buyQuantity")} onBlur={() => trigger("buyQuantity")} onChange={(value) => update("buyQuantity", value)} /><QuantityField label="Tặng Y phần" value={draft.rewardQuantity} error={errorForPath("rewardQuantity")} onBlur={() => trigger("rewardQuantity")} onChange={(value) => update("rewardQuantity", value)} /></div>
    <AdaptiveSelect label="Loại quà" options={[{ value: "PRODUCT", label: "Sản phẩm" }, { value: "ADDON", label: "Addon" }]} value={draft.rewardKind} onChange={(value) => {
      const rewardKind = value as VoucherDraft["rewardKind"];
      update("rewardKind", rewardKind);
      trigger("rewardKind");
      if (rewardKind === "PRODUCT") {
        update("rewardAddonOptionIds", []);
        update("benefitScaling", "PER_BUNDLE");
      } else {
        update("rewardMode", "ALLOWED_SCOPE");
        update("rewardProductScopes", []);
      }
    }} />
    {draft.rewardKind === "PRODUCT" ? <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Cách xác định cấu hình quà</legend>
        <div className="grid min-w-0 grid-cols-3 gap-2">
              {([
            { value: "SAME_CONFIG", label: "Tặng cùng món mua" },
            { value: "FIXED_CONFIG", label: "Tặng món chỉ định" },
            { value: "ALLOWED_SCOPE", label: "Chọn quà trong danh sách" },
          ] as const).map((mode) => (
            <button
              key={mode.value}
              type="button"
              aria-pressed={draft.rewardMode === mode.value}
              onClick={() => {
                update("rewardMode", mode.value);
                trigger("rewardMode");
                if (mode.value === "SAME_CONFIG") update("rewardProductScopes", []);
              }}
              className={`min-h-14 min-w-0 break-words rounded-xl border px-2 py-2 text-xs font-semibold transition active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${draft.rewardMode === mode.value ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </fieldset>
      {draft.rewardMode !== "SAME_CONFIG" && <BundleSharedScopeEditor label={draft.rewardMode === "FIXED_CONFIG" ? "Một món quà cố định" : "Các món có thể nhận quà"} purpose={draft.rewardMode} scopeField="rewardProductScopes" scopes={draft.rewardProductScopes} menuItems={menuItems} powderOptions={powderOptions} milkOptions={milkOptions} onChange={(value) => update("rewardProductScopes", value)} />}
    </> : <>
      <AdaptiveSelect label="Nhóm addon có thể nhận quà" multiple options={addonOptions} value={draft.rewardAddonOptionIds} error={errorForPath("rewardAddonOptionIds")} onChange={(value) => { update("rewardAddonOptionIds", value as string[]); trigger("rewardAddonOptionIds"); }} />
      <AdaptiveSelect label="Cách nhân quyền lợi addon" options={[{ value: "PER_BUNDLE", label: "Theo mỗi nhóm mua X" }, { value: "ONCE_PER_ORDER", label: "Một lần trong đơn" }, { value: "PER_QUALIFYING_ITEM", label: "Theo tổng số món đủ điều kiện" }]} value={draft.benefitScaling} onChange={(value) => { const scaling = value as VoucherDraft["benefitScaling"]; update("benefitScaling", scaling); if (scaling === "ONCE_PER_ORDER") update("maxApplications", 1); }} />
      {draft.benefitScaling === "PER_QUALIFYING_ITEM" && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Tặng theo tổng số món đủ điều kiện trong đơn.</p>}
    </>}
    <div className="grid min-w-0 grid-cols-2 gap-3"><QuantityField label="Lượt tối đa cho voucher này trong đơn" value={draft.maxApplications} error={errorForPath("maxApplications")} onBlur={() => trigger("maxApplications")} disabled={draft.benefitScaling === "ONCE_PER_ORDER"} onChange={(value) => update("maxApplications", value)} /><label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">Đơn tối thiểu (VND)</span><input type="number" min={1_000} step={1_000} value={draft.minOrderVnd ?? ""} onBlur={() => trigger("minOrderVnd")} onChange={(event) => update("minOrderVnd", event.target.value ? Number(event.target.value) : null)} className={`${inputClass} ${errorForPath("minOrderVnd") ? "border-destructive" : ""}`} />{errorForPath("minOrderVnd") ? <span className="text-xs text-destructive">{errorForPath("minOrderVnd")}</span> : null}</label></div>
    <BundleSharedScopeEditor label="Món mua đủ điều kiện" purpose="QUALIFIER" scopeField="qualifierScopes" scopes={draft.qualifierScopes} menuItems={menuItems} powderOptions={powderOptions} milkOptions={milkOptions} onChange={(value) => update("qualifierScopes", value)} />
  </div>;
}
