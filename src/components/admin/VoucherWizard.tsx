"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import { BundleBenefitFields } from "@/src/components/admin/BundleBenefitFields";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { buildVoucherInput, createEmptyVoucherDraft, describeVoucherDraft, estimateVoucherLiabilityVnd, validateVoucherDraft, type VoucherDraft, type VoucherType } from "@/src/lib/utils/adminVoucherForm";
import type { AdaptiveSelectOption } from "@/src/lib/utils/adaptiveSelect";
import type { CreateVoucherPackageInput } from "@/src/services/adminVoucherService";
import type { BundleMenuConfig } from "@/src/lib/utils/adminVoucherBundle";

interface VoucherWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuOptions: AdaptiveSelectOption[];
  bundleMenuItems: BundleMenuConfig[];
  addonOptions: AdaptiveSelectOption[];
  powderOptions: AdaptiveSelectOption[];
  milkOptions: AdaptiveSelectOption[];
  menuPriceById: ReadonlyMap<string, number>;
  addonPriceById: ReadonlyMap<string, number>;
  submitting: boolean;
  onSubmit: (input: CreateVoucherPackageInput) => void;
}

const TYPE_OPTIONS: Array<{ value: VoucherType; label: string; hint: string }> = [
  { value: "BUNDLE", label: "Mua X tặng Y", hint: "Tặng món hoặc addon theo nhóm điều kiện" },
  { value: "PRODUCT", label: "Tặng sản phẩm", hint: "Miễn giá một cấu hình sản phẩm" },
  { value: "ADDON", label: "Tặng addon", hint: "Miễn giá một addon" },
  { value: "DISCOUNT", label: "Giảm giá", hint: "Giảm phần trăm hoặc số tiền" },
  { value: "FREESHIP", label: "Freeship", hint: "Hỗ trợ phí giao hàng" },
];

const inputClass = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary";
const numberValue = (value: string): number => Number(value) || 0;

function NumberField({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number | null; onChange: (value: number | null) => void; min?: number; step?: number }) {
  return <label className="space-y-1.5"><span className="text-sm font-semibold">{label}</span><input type="number" min={min} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value ? numberValue(event.target.value) : null)} className={inputClass} /></label>;
}

function BenefitFields({ draft, update, menuOptions, bundleMenuItems, addonOptions, powderOptions, milkOptions }: {
  draft: VoucherDraft; update: <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => void;
  menuOptions: AdaptiveSelectOption[]; bundleMenuItems: BundleMenuConfig[]; addonOptions: AdaptiveSelectOption[];
  powderOptions: AdaptiveSelectOption[]; milkOptions: AdaptiveSelectOption[];
}) {
  if (draft.voucherType === "BUNDLE") return <BundleBenefitFields draft={draft} update={update} menuItems={bundleMenuItems} addonOptions={addonOptions} powderOptions={powderOptions} milkOptions={milkOptions} />;
  if (draft.voucherType === "PRODUCT") return <div className="space-y-4"><AdaptiveSelect label="Sản phẩm" options={menuOptions} value={draft.menuItemId} onChange={(value) => update("menuItemId", value as string)} /><AdaptiveSelect label="Size" options={[{ value: "SMALL", label: "Small" }, { value: "MEDIUM", label: "Medium" }, { value: "LARGE", label: "Large" }]} value={draft.size} onChange={(value) => update("size", value as VoucherDraft["size"])} /><AdaptiveSelect label="Bột (nếu áp dụng)" options={[{ value: "", label: "Mặc định" }, ...powderOptions]} value={draft.matchaPowderId} onChange={(value) => update("matchaPowderId", value as string)} /></div>;
  if (draft.voucherType === "ADDON") return <AdaptiveSelect label="Addon được tặng" options={addonOptions} value={draft.addonOptionId} onChange={(value) => update("addonOptionId", value as string)} />;
  if (draft.voucherType === "FREESHIP") return <div className="space-y-4"><NumberField label="Phí giao tối đa được hỗ trợ" value={draft.coveredDeliveryFeeVnd} min={1_000} step={1_000} onChange={(value) => update("coveredDeliveryFeeVnd", value ?? 0)} /><NumberField label="Giá trị đơn tối thiểu" value={draft.minOrderVnd} min={1_000} step={1_000} onChange={(value) => update("minOrderVnd", value)} /></div>;
  return <div className="space-y-4"><AdaptiveSelect label="Kiểu giảm" options={[{ value: "PERCENT", label: "Phần trăm" }, { value: "FIXED", label: "Số tiền" }]} value={draft.discountType} onChange={(value) => update("discountType", value as VoucherDraft["discountType"])} /><NumberField label={draft.discountType === "PERCENT" ? "Mức giảm (%)" : "Mức giảm (VND)"} value={draft.discountValue} min={1} step={draft.discountType === "FIXED" ? 1_000 : 1} onChange={(value) => update("discountValue", value ?? 0)} /><NumberField label="Giá trị đơn tối thiểu" value={draft.minOrderVnd} min={1_000} step={1_000} onChange={(value) => update("minOrderVnd", value)} /></div>;
}

/** Three-step admin wizard for creating every voucher type in one place. */
export function VoucherWizard(props: VoucherWizardProps) {
  const [step, setStep] = useState(1); const [draft, setDraft] = useState(createEmptyVoucherDraft); const [confirmOpen, setConfirmOpen] = useState(false);
  const update = <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const close = (open: boolean) => { props.onOpenChange(open); if (!open) { setStep(1); setDraft(createEmptyVoucherDraft()); setConfirmOpen(false); } };
  const next = () => { if (step === 1 && !draft.name.trim()) return toast.error("Vui lòng nhập tên voucher"); setStep((value) => Math.min(3, value + 1)); };
  const submit = () => { const error = validateVoucherDraft(draft); if (error) return toast.error(error); setConfirmOpen(true); };
  const menuLabels = new Map(props.menuOptions.map((option) => [option.value, option.label])); const addonLabels = new Map(props.addonOptions.map((option) => [option.value, option.label]));
  const powderLabels = new Map(props.powderOptions.map((option) => [option.value, option.label])); const milkLabels = new Map(props.milkOptions.map((option) => [option.value, option.label]));
  const review = describeVoucherDraft(draft, menuLabels, addonLabels, powderLabels, milkLabels); const liability = estimateVoucherLiabilityVnd(draft, props.menuPriceById, props.addonPriceById);
  return <Dialog.Root open={props.open} onOpenChange={close}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" /><Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 overflow-y-auto bg-background p-4 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[90vh] md:w-[720px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:p-6"><div className="mx-auto flex max-w-2xl flex-col gap-5"><div className="flex items-center justify-between"><div><Dialog.Title className="text-xl font-bold">Tạo voucher</Dialog.Title><p className="text-sm text-muted-foreground">Bước {step}/3 · {step === 1 ? "Thông tin" : step === 2 ? "Quyền lợi" : "Phát hành"}</p></div><Dialog.Close className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted" aria-label="Đóng"><X /></Dialog.Close></div>
  {step === 1 ? <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2">{TYPE_OPTIONS.map((type) => <button type="button" key={type.value} onClick={() => update("voucherType", type.value)} className={`min-h-20 rounded-xl border p-3 text-left ${draft.voucherType === type.value ? "border-primary bg-primary/5" : "border-input"}`}><strong className="block text-sm">{type.label}</strong><span className="text-xs text-muted-foreground">{type.hint}</span></button>)}</div><label className="space-y-1.5"><span className="text-sm font-semibold">Tên voucher</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} className={inputClass} /></label><label className="space-y-1.5"><span className="text-sm font-semibold">Mô tả</span><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-24 w-full rounded-xl border border-input bg-background p-3 text-sm" /></label></div> : null}
  {step === 2 ? <BenefitFields draft={draft} update={update} menuOptions={props.menuOptions} bundleMenuItems={props.bundleMenuItems} addonOptions={props.addonOptions} powderOptions={props.powderOptions} milkOptions={props.milkOptions} /> : null}
  {step === 3 ? <div className="space-y-4"><AdaptiveSelect label="Cách khách nhận voucher" options={[{ value: "AUTO_GRANT", label: "Tự có trong ví" }, { value: "FREE_CLAIM", label: "Nhận miễn phí" }, { value: "POINTS_EXCHANGE", label: "Đổi bằng điểm" }]} value={draft.acquisitionMode} onChange={(value) => update("acquisitionMode", value as VoucherDraft["acquisitionMode"])} />{draft.acquisitionMode === "POINTS_EXCHANGE" ? <NumberField label="Số điểm cần đổi" value={draft.pointsCost} min={1} onChange={(value) => update("pointsCost", value ?? 0)} /> : null}<label className="space-y-1.5"><span className="text-sm font-semibold">Dùng đến hết ngày (không bắt buộc)</span><input type="date" value={draft.endsAt} onChange={(event) => update("endsAt", event.target.value)} className={inputClass} /></label><div className="grid grid-cols-2 gap-3"><NumberField label="Số voucher phát hành (trống = không giới hạn)" value={draft.quantity} min={1} onChange={(value) => update("quantity", value)} /><NumberField label="Tối đa mỗi khách" value={draft.maxPerUser} min={1} onChange={(value) => update("maxPerUser", value ?? 1)} /><NumberField label="Hạn dùng sau khi nhận (ngày)" value={draft.expiresAfterDays} min={1} onChange={(value) => update("expiresAfterDays", value)} /></div><div className="rounded-xl bg-muted p-4 text-sm"><strong>{draft.name}</strong><p className="mt-1 text-muted-foreground">{review}</p><p className="mt-2 font-semibold text-amber-800">{liability === null ? "Chi phí tối đa: chưa giới hạn" : `Chi phí tối đa ước tính: ${liability.toLocaleString("vi-VN")}đ`}</p></div></div> : null}
  <div className="mt-auto flex gap-3 border-t pt-4">{step > 1 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border font-semibold"><ArrowLeft className="h-4 w-4" />Quay lại</button> : null}{step < 3 ? <button type="button" onClick={next} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground">Tiếp tục<ArrowRight className="h-4 w-4" /></button> : <button type="button" disabled={props.submitting} onClick={submit} className="h-11 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">{props.submitting ? "Đang tạo…" : "Kiểm tra & tạo voucher"}</button>}</div></div></Dialog.Content></Dialog.Portal><ConfirmModal isOpen={confirmOpen} title="Xác nhận phát hành voucher?" message={`${review}. ${draft.quantity === null ? "Số lượng phát hành chưa giới hạn." : `Phát hành tối đa ${draft.quantity} voucher.`} Rule sẽ không thể sửa sau khi tạo.`} confirmLabel={props.submitting ? "Đang tạo…" : "Phát hành"} onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); props.onSubmit(buildVoucherInput(draft)); }} /></Dialog.Root>;
}
