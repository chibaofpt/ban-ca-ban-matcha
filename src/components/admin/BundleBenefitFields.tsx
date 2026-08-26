"use client";

import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import { BundleScopeEditor } from "@/src/components/admin/BundleScopeEditor";
import type { VoucherDraft } from "@/src/lib/utils/adminVoucherForm";
import type { BundleMenuConfig } from "@/src/lib/utils/adminVoucherBundle";
import type { AdaptiveSelectOption } from "@/src/lib/utils/adaptiveSelect";

const inputClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary";

function QuantityField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{label}</span><input type="number" min={1} value={value} onChange={(event) => onChange(Number(event.target.value) || 1)} className={inputClass} /></label>;
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
  return <div className="min-w-0 space-y-4 overflow-x-clip">
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><QuantityField label="Mua X món" value={draft.buyQuantity} onChange={(value) => update("buyQuantity", value)} /><QuantityField label="Tặng Y phần" value={draft.rewardQuantity} onChange={(value) => update("rewardQuantity", value)} /></div>
    <BundleScopeEditor label="Nhóm món được tính điều kiện" purpose="QUALIFIER" scopes={draft.qualifierScopes} menuItems={menuItems} powderOptions={powderOptions} milkOptions={milkOptions} onChange={(value) => update("qualifierScopes", value)} />
    <AdaptiveSelect label="Loại quà" options={[{ value: "PRODUCT", label: "Sản phẩm" }, { value: "ADDON", label: "Addon" }]} value={draft.rewardKind} onChange={(value) => update("rewardKind", value as VoucherDraft["rewardKind"])} />
    {draft.rewardKind === "PRODUCT" ? <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Cách xác định cấu hình quà</legend>
        <div className="grid min-w-0 grid-cols-3 gap-2">
          {([
            { value: "FIXED_CONFIG", label: "Cấu hình đúng" },
            { value: "ALLOWED_SCOPE", label: "Cấu hình cho phép" },
            { value: "SAME_CONFIG", label: "Sản phẩm cùng loại" },
          ] as const).map((mode) => (
            <button
              key={mode.value}
              type="button"
              aria-pressed={draft.rewardMode === mode.value}
              onClick={() => update("rewardMode", mode.value)}
              className={`min-h-14 min-w-0 break-words rounded-xl border px-2 py-2 text-xs font-semibold transition active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${draft.rewardMode === mode.value ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </fieldset>
      {draft.rewardMode !== "SAME_CONFIG" && <BundleScopeEditor label="Nhóm món có thể nhận quà" purpose={draft.rewardMode} scopes={draft.rewardProductScopes} menuItems={menuItems} powderOptions={powderOptions} milkOptions={milkOptions} onChange={(value) => update("rewardProductScopes", value)} />}
    </> : <>
      <AdaptiveSelect label="Nhóm addon có thể nhận quà" multiple options={addonOptions} value={draft.rewardAddonOptionIds} onChange={(value) => update("rewardAddonOptionIds", value as string[])} />
      <AdaptiveSelect label="Cách nhân quyền lợi addon" options={[{ value: "PER_BUNDLE", label: "Theo mỗi nhóm mua X" }, { value: "ONCE_PER_ORDER", label: "Một lần trong đơn" }, { value: "PER_QUALIFYING_ITEM", label: "Theo tổng số món đủ điều kiện" }]} value={draft.benefitScaling} onChange={(value) => { const scaling = value as VoucherDraft["benefitScaling"]; update("benefitScaling", scaling); if (scaling === "ONCE_PER_ORDER") update("maxApplications", 1); }} />
      {draft.benefitScaling === "PER_QUALIFYING_ITEM" && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Quyền lợi được tính theo tổng số món đủ điều kiện. Backend hiện chưa bắt buộc mỗi ly phải nhận đúng một addon riêng.</p>}
    </>}
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{draft.benefitScaling !== "ONCE_PER_ORDER" && <QuantityField label="Số lần tối đa/đơn" value={draft.maxApplications} onChange={(value) => update("maxApplications", value)} />}<label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">Giá trị đơn tối thiểu</span><input type="number" min={1_000} step={1_000} value={draft.minOrderVnd ?? ""} onChange={(event) => update("minOrderVnd", event.target.value ? Number(event.target.value) : null)} className={inputClass} /></label></div>
  </div>;
}
