"use client";

import { useFormContext, type FieldPath, type UseFormReturn } from "react-hook-form";
import type { VoucherDraft } from "@/src/lib/utils/adminVoucherForm";

const inputClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary";
const numberValue = (value: string): number => Number(value) || 0;

interface VoucherIssuanceFieldsProps {
  draft: VoucherDraft;
  update: <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => void;
  form: UseFormReturn<VoucherDraft>;
  submitting: boolean;
  review: string;
  liability: number | null;
}

/** Reads one shallow RHF field error for reuse by wizard step controls. */
export function voucherFormError(form: UseFormReturn<VoucherDraft>, field: keyof VoucherDraft): string | undefined {
  const message = form.formState.errors[field]?.message;
  return typeof message === "string" ? message : undefined;
}

/** Renders inline errors for a group of Step 2 controls. */
export function VoucherInlineFieldErrors({ fields }: { fields: readonly (keyof VoucherDraft)[] }) {
  const form = useFormContext<VoucherDraft>();
  return <>{fields.map((field) => { const message = voucherFormError(form, field); return message ? <p key={String(field)} className="text-xs text-destructive">{message}</p> : null; })}</>;
}

function NumberField({ label, value, onChange, min = 0, step = 1, disabled = false, error, onBlur }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
  error?: string;
  onBlur: () => void;
}) {
  return <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{label}</span><input type="number" min={min} step={step} value={value ?? ""} disabled={disabled} onBlur={onBlur} onChange={(event) => onChange(event.target.value ? numberValue(event.target.value) : null)} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70`} />{error ? <span className="text-xs text-destructive">{error}</span> : null}</label>;
}

/** Renders the three acquisition choices and compact issuance controls. */
export function VoucherIssuanceFields({ draft, update, form, submitting, review, liability }: VoucherIssuanceFieldsProps) {
  const modes = [
    { value: "POINTS_EXCHANGE", label: "Đổi bằng điểm" },
    { value: "FREE_CLAIM", label: "Nhận miễn phí" },
    { value: "AUTO_GRANT", label: "Tự có trong ví" },
  ] as const;
  const points = draft.acquisitionMode === "POINTS_EXCHANGE" ? draft.pointsCost : 0;
  const maxPerUserDisabled = draft.acquisitionMode !== "POINTS_EXCHANGE";
  const errorFor = (field: keyof VoucherDraft): string | undefined => {
    return voucherFormError(form, field);
  };
  const validateField = (field: FieldPath<VoucherDraft>): void => { void form.trigger(field); };
  return <div className="min-w-0 space-y-4 overflow-x-clip">
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Cách khách nhận voucher</legend><div className="grid min-w-0 grid-cols-3 gap-2">{modes.map((mode) => <button key={mode.value} type="button" disabled={submitting} aria-pressed={draft.acquisitionMode === mode.value} onClick={() => update("acquisitionMode", mode.value)} className={`min-h-14 min-w-0 break-words rounded-xl border px-2 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${draft.acquisitionMode === mode.value ? "border-primary bg-primary/10 text-primary" : "border-input"}`}>{mode.label}</button>)}</div></fieldset>
    <div className="grid min-w-0 grid-cols-3 gap-3"><NumberField label="Điểm đổi" value={points} min={1} disabled={maxPerUserDisabled} onBlur={() => validateField("pointsCost")} onChange={(value) => update("pointsCost", value ?? 0)} error={errorFor("pointsCost")} /><NumberField label="Tối đa/khách" value={draft.maxPerUser} min={1} disabled={maxPerUserDisabled} onBlur={() => validateField("maxPerUser")} onChange={(value) => update("maxPerUser", value ?? 1)} error={errorFor("maxPerUser")} /><NumberField label="Tổng phát hành" value={draft.quantity} min={1} onBlur={() => validateField("quantity")} onChange={(value) => update("quantity", value)} error={errorFor("quantity")} /></div>
    <div className="grid min-w-0 grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-3"><label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">Ngày kết thúc</span><input type="date" value={draft.endsAt} onBlur={() => validateField("endsAt")} onChange={(event) => update("endsAt", event.target.value)} className={inputClass} /></label><NumberField label="Hạn dùng sau khi đổi" value={draft.expiresAfterDays} min={1} onBlur={() => validateField("expiresAfterDays")} onChange={(value) => update("expiresAfterDays", value)} error={errorFor("expiresAfterDays")} /></div>
    <div className="rounded-xl bg-muted p-4 text-sm"><strong>{draft.name}</strong><p className="mt-1 text-muted-foreground">{review}</p>{draft.voucherType !== "BUNDLE" ? <p className="mt-2 font-semibold text-amber-800">{liability === null ? "Chi phí tối đa: chưa giới hạn" : `Chi phí tối đa ước tính: ${liability.toLocaleString("vi-VN")}đ`}</p> : null}</div>
  </div>;
}
