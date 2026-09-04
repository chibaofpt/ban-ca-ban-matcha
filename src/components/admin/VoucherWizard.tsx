"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AdaptiveSelect } from "@/src/components/shared/AdaptiveSelect";
import { BundleBenefitFields } from "@/src/components/admin/BundleBenefitFields";
import { ProductDiscountTargetSelector } from "@/src/components/admin/ProductDiscountTargetSelector";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { buildVoucherInput, createEmptyVoucherDraft, describeVoucherDraft, estimateVoucherLiabilityVnd, suggestVoucherCopy, validateVoucherDraft, type VoucherCopyLabels, type VoucherDraft, type VoucherType } from "@/src/lib/utils/adminVoucherForm";
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
  { value: "DISCOUNT", label: "Giảm hóa đơn", hint: "Giảm phần trăm hoặc số tiền" },
  { value: "PRODUCT_DISCOUNT", label: "Giảm theo món", hint: "Giảm cố định hoặc trả giá size khác" },
  { value: "FREESHIP", label: "Freeship", hint: "Hỗ trợ phí giao hàng" },
  { value: "PRODUCT", label: "Tặng ly", hint: "Miễn giá một cấu hình sản phẩm" },
  { value: "ITEM", label: "Tặng món lẻ", hint: "Miễn giá một món bán lẻ cố định" },
  { value: "ADDON", label: "Tặng topping", hint: "Miễn giá một addon" },
  { value: "BUNDLE", label: "Mua X tặng Y", hint: "Tặng món hoặc addon theo nhóm điều kiện" },
];

const VOUCHER_TITLE_BY_TYPE: Record<VoucherType, string> = {
  DISCOUNT: "giảm hóa đơn",
  PRODUCT_DISCOUNT: "giảm giá món",
  FREESHIP: "miễn phí giao hàng",
  PRODUCT: "tặng ly",
  ITEM: "tặng món lẻ",
  ADDON: "tặng topping",
  BUNDLE: "mua món tặng món",
};

const inputClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary";
const numberValue = (value: string): number => Number(value) || 0;

function NumberField({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number | null; onChange: (value: number | null) => void; min?: number; step?: number }) {
  return <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">{label}</span><input type="number" min={min} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value ? numberValue(event.target.value) : null)} className={inputClass} /></label>;
}

function BenefitFields({ draft, update, menuOptions, bundleMenuItems, addonOptions, powderOptions, milkOptions }: {
  draft: VoucherDraft; update: <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => void;
  menuOptions: AdaptiveSelectOption[]; bundleMenuItems: BundleMenuConfig[]; addonOptions: AdaptiveSelectOption[];
  powderOptions: AdaptiveSelectOption[]; milkOptions: AdaptiveSelectOption[];
}) {
  if (draft.voucherType === "BUNDLE") return <BundleBenefitFields draft={draft} update={update} menuItems={bundleMenuItems} addonOptions={addonOptions} powderOptions={powderOptions} milkOptions={milkOptions} />;
  if (draft.voucherType === "PRODUCT") {
    const selectedMenu = bundleMenuItems.find((menu) => menu.id === draft.menuItemId);
    const allowedBaseLiquidIds = new Set(selectedMenu?.availableBaseLiquidIds ?? []);
    const itemBaseLiquids = milkOptions.filter((option) => allowedBaseLiquidIds.has(option.value));
    return <div className="space-y-4"><AdaptiveSelect label="Sản phẩm" options={menuOptions} value={draft.menuItemId} onChange={(value) => { const menu = bundleMenuItems.find((candidate) => candidate.id === value); update("menuItemId", value as string); update("milkTypeId", menu?.availableBaseLiquidIds[0] ?? ""); }} /><AdaptiveSelect label="Size" options={[{ value: "SMALL", label: "Small" }, { value: "MEDIUM", label: "Medium" }, { value: "LARGE", label: "Large" }]} value={draft.size} onChange={(value) => update("size", value as VoucherDraft["size"])} /><AdaptiveSelect label="Bột (nếu áp dụng)" options={[{ value: "", label: "Mặc định" }, ...powderOptions]} value={draft.matchaPowderId} onChange={(value) => update("matchaPowderId", value as string)} />{itemBaseLiquids.length > 0 ? <AdaptiveSelect label="Base Liquid" options={itemBaseLiquids} value={draft.milkTypeId} onChange={(value) => update("milkTypeId", value as string)} /> : null}</div>;
  }
  if (draft.voucherType === "PRODUCT_DISCOUNT") {
    const sizes = ["SMALL", "MEDIUM", "LARGE"] as const;
    const selectedIds = draft.eligibleMenuItemIds?.length ? draft.eligibleMenuItemIds : draft.menuItemId ? [draft.menuItemId] : [];
    const selectedMenus = bundleMenuItems.filter((menu) => selectedIds.includes(menu.id));
    const sharedSizes = sizes.filter((size) => selectedMenus.length > 0 && selectedMenus.every((menu) => menu.availableSizes.includes(size)));
    return <div className="space-y-4">
      <ProductDiscountTargetSelector items={bundleMenuItems} selectedIds={selectedIds} onChange={(ids) => { const nextMenus = bundleMenuItems.filter((menu) => ids.includes(menu.id)); const nextShared = sizes.filter((size) => nextMenus.length > 0 && nextMenus.every((menu) => menu.availableSizes.includes(size))); update("eligibleMenuItemIds", ids); update("menuItemId", ids[0] ?? ""); update("eligibleSizes", draft.eligibleSizes.filter((size) => nextShared.includes(size))); if (!nextShared.includes(draft.referenceSize)) update("referenceSize", nextShared[0] ?? "SMALL"); }} />
      <AdaptiveSelect label="Kiểu giảm" options={[{ value: "FIXED_AMOUNT", label: "Giảm số tiền" }, { value: "PAY_AS_SIZE", label: "Trả giá size vừa" }]} value={draft.productDiscountMode} onChange={(value) => update("productDiscountMode", value as VoucherDraft["productDiscountMode"])} />
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">Size được áp dụng</legend><div className="flex gap-2">{sizes.map((size) => <button key={size} type="button" disabled={!sharedSizes.includes(size)} onClick={() => update("eligibleSizes", draft.eligibleSizes.includes(size) ? draft.eligibleSizes.filter((value) => value !== size) : [...draft.eligibleSizes, size])} className={`min-h-11 min-w-11 rounded-xl border px-3 text-sm disabled:opacity-40 ${draft.eligibleSizes.includes(size) ? "border-primary bg-primary/5" : "border-input"}`}>{size}</button>)}</div></fieldset>
      {draft.productDiscountMode === "FIXED_AMOUNT"
        ? <NumberField label="Mức giảm (VND)" value={draft.discountValue} min={1_000} step={1_000} onChange={(value) => update("discountValue", value ?? 0)} />
        : <AdaptiveSelect label="Size tham chiếu" options={sharedSizes.map((size) => ({ value: size, label: size }))} value={sharedSizes.includes(draft.referenceSize) ? draft.referenceSize : sharedSizes[0] ?? ""} onChange={(value) => update("referenceSize", value as VoucherDraft["referenceSize"])} />}
    </div>;
  }
  if (draft.voucherType === "ITEM") {
    const extras = bundleMenuItems
      .filter((menu) => menu.category === "extras")
      .map((menu) => ({ value: menu.id, label: menu.name, description: "Add-on" }));
    return <AdaptiveSelect label="Add-on" options={extras} value={draft.menuItemId} onChange={(value) => update("menuItemId", value as string)} />;
  }
  if (draft.voucherType === "ADDON") return <AdaptiveSelect label="Addon được tặng" options={addonOptions} value={draft.addonOptionId} onChange={(value) => update("addonOptionId", value as string)} />;
  if (draft.voucherType === "FREESHIP") return <div className="space-y-4"><NumberField label="Phí giao tối đa được hỗ trợ" value={draft.coveredDeliveryFeeVnd} min={1_000} step={1_000} onChange={(value) => update("coveredDeliveryFeeVnd", value ?? 0)} /><NumberField label="Giá trị đơn tối thiểu" value={draft.minOrderVnd} min={1_000} step={1_000} onChange={(value) => update("minOrderVnd", value)} /></div>;
  return <div className="space-y-4">
    <AdaptiveSelect label="Kiểu giảm" options={[{ value: "PERCENT", label: "Phần trăm" }, { value: "FIXED", label: "Số tiền" }]} value={draft.discountType} onChange={(value) => update("discountType", value as VoucherDraft["discountType"])} />
    <NumberField label={draft.discountType === "PERCENT" ? "Mức giảm (%)" : "Mức giảm (VND)"} value={draft.discountValue} min={1} step={draft.discountType === "FIXED" ? 1_000 : 1} onChange={(value) => update("discountValue", value ?? 0)} />
    {draft.discountType === "PERCENT" && <NumberField label="Mức giảm tối đa (VND)" value={draft.maxDiscountVnd} min={1_000} step={1_000} onChange={(value) => update("maxDiscountVnd", value)} />}
    <NumberField label="Giá trị đơn tối thiểu" value={draft.minOrderVnd} min={1_000} step={1_000} onChange={(value) => update("minOrderVnd", value)} />
  </div>;
}

/** Three-step admin wizard for creating every voucher type in one place. */
export function VoucherWizard(props: VoucherWizardProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(createEmptyVoucherDraft);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const manualCopy = useRef({ name: false, description: false });
  const copyLabels = useMemo<VoucherCopyLabels>(() => ({
    menuLabels: new Map(props.menuOptions.map((option) => [option.value, option.label])),
    addonLabels: new Map(props.addonOptions.map((option) => [option.value, option.label])),
    powderLabels: new Map(props.powderOptions.map((option) => [option.value, option.label])),
    milkLabels: new Map(props.milkOptions.map((option) => [option.value, option.label])),
    defaultPowderByMenuId: new Map(props.bundleMenuItems.map((menu) => [menu.id, menu.fixedPowderId ?? menu.availablePowderIds[0] ?? ""])),
    defaultMilkByMenuId: new Map(props.bundleMenuItems.map((menu) => [menu.id, menu.availableBaseLiquidIds[0] ?? ""])),
  }), [props.addonOptions, props.bundleMenuItems, props.menuOptions, props.milkOptions, props.powderOptions]);
  const update = <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) => {
    if (key === "name") manualCopy.current.name = true;
    if (key === "description") manualCopy.current.description = true;
    setDraft((current) => {
      const nextDraft = { ...current, [key]: value };
      if (key === "name" || key === "description") return nextDraft;
      const suggestion = suggestVoucherCopy(nextDraft, copyLabels);
      return {
        ...nextDraft,
        name: manualCopy.current.name ? nextDraft.name : suggestion.name,
        description: manualCopy.current.description ? nextDraft.description : suggestion.description,
      };
    });
  };
  const chooseType = (voucherType: VoucherType) => {
    manualCopy.current = { name: false, description: false };
    setDraft((current) => {
      const nextDraft = { ...current, voucherType };
      return { ...nextDraft, ...suggestVoucherCopy(nextDraft, copyLabels) };
    });
    setStep(2);
  };
  const close = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      setStep(1);
      setDraft(createEmptyVoucherDraft());
      setConfirmOpen(false);
      manualCopy.current = { name: false, description: false };
    }
  };
  const next = () => {
    if (!draft.name.trim()) return toast.error("Vui lòng nhập tên voucher");
    setStep(3);
  };
  const submit = () => { const error = validateVoucherDraft(draft); if (error) return toast.error(error); setConfirmOpen(true); };
  const review = describeVoucherDraft(draft, copyLabels.menuLabels, copyLabels.addonLabels, copyLabels.powderLabels, copyLabels.milkLabels);
  const liability = estimateVoucherLiabilityVnd(draft, props.menuPriceById, props.addonPriceById);
  const suggestion = suggestVoucherCopy(draft, copyLabels);
  const overlayTitle = step === 1 ? "Tạo voucher" : `Tạo voucher ${VOUCHER_TITLE_BY_TYPE[draft.voucherType]}`;
  const restoreSuggestion = () => {
    manualCopy.current = { name: false, description: false };
    setDraft((current) => ({ ...current, ...suggestVoucherCopy(current, copyLabels) }));
  };
  const footer = step === 1 ? undefined : (
    <div className="flex gap-3">
      <button type="button" onClick={() => setStep((value) => value - 1)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border font-semibold transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" />Quay lại
      </button>
      {step === 2 ? (
        <button type="button" onClick={next} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Tiếp tục<ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" disabled={props.submitting} onClick={submit} className="h-11 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {props.submitting ? "Đang tạo…" : "Kiểm tra & tạo"}
        </button>
      )}
    </div>
  );

  return <>
    <ResponsiveOverlay
      open={props.open}
      onOpenChange={close}
      title={overlayTitle}
      description={`Bước ${step}/3 · ${step === 1 ? "Chọn loại" : step === 2 ? "Cấu hình quyền lợi" : "Phát hành"}`}
      size="lg"
      dismissPolicy="locked-while-busy"
      busy={props.submitting}
      footer={footer}
      className="w-full max-w-[100dvw] overflow-x-clip md:max-w-3xl"
    >
      {step === 1 ? (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">Chọn loại voucher để tiếp tục.</p>
          <div className="grid min-w-0 grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((type) => (
              <button
                type="button"
                key={type.value}
                onClick={() => chooseType(type.value)}
                aria-label={`${type.label}: ${type.hint}`}
                className={`min-h-20 min-w-0 break-words rounded-2xl border px-2 py-3 text-center text-xs font-bold transition active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${draft.voucherType === type.value ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {step === 2 ? (
        <div className="min-w-0 space-y-6 overflow-x-clip">
          <BenefitFields draft={draft} update={update} menuOptions={props.menuOptions} bundleMenuItems={props.bundleMenuItems} addonOptions={props.addonOptions} powderOptions={props.powderOptions} milkOptions={props.milkOptions} />
          <section className="space-y-4 rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="font-bold">Nội dung khách sẽ thấy</h3><p className="mt-1 text-xs text-muted-foreground">Tự cập nhật theo quyền lợi cho đến khi bạn sửa tay.</p></div>
              <button type="button" disabled={!suggestion.name} onClick={restoreSuggestion} className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">Dùng gợi ý</button>
            </div>
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">Tên voucher</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Tên ngắn gọn khách dễ hiểu" className={inputClass} /></label>
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold">Mô tả</span><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Mô tả quyền lợi và điều kiện áp dụng" className="min-h-24 w-full min-w-0 max-w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary" /></label>
          </section>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="min-w-0 space-y-4 overflow-x-clip">
          <AdaptiveSelect label="Cách khách nhận voucher" options={[{ value: "AUTO_GRANT", label: "Tự có trong ví" }, { value: "FREE_CLAIM", label: "Nhận miễn phí" }, { value: "POINTS_EXCHANGE", label: "Đổi bằng điểm" }]} value={draft.acquisitionMode} onChange={(value) => update("acquisitionMode", value as VoucherDraft["acquisitionMode"])} />
          {draft.acquisitionMode === "POINTS_EXCHANGE" ? <NumberField label="Số điểm cần đổi" value={draft.pointsCost} min={1} onChange={(value) => update("pointsCost", value ?? 0)} /> : null}
          <label className="space-y-1.5"><span className="text-sm font-semibold">Dùng đến hết ngày (không bắt buộc)</span><input type="date" value={draft.endsAt} onChange={(event) => update("endsAt", event.target.value)} className={inputClass} /></label>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><NumberField label="Số voucher phát hành (trống = không giới hạn)" value={draft.quantity} min={1} onChange={(value) => update("quantity", value)} /><NumberField label="Tối đa mỗi khách" value={draft.maxPerUser} min={1} onChange={(value) => update("maxPerUser", value ?? 1)} /><NumberField label="Hạn dùng sau khi nhận (ngày)" value={draft.expiresAfterDays} min={1} onChange={(value) => update("expiresAfterDays", value)} /></div>
          <div className="rounded-xl bg-muted p-4 text-sm"><strong>{draft.name}</strong><p className="mt-1 text-muted-foreground">{review}</p><p className="mt-2 font-semibold text-amber-800">{liability === null ? "Chi phí tối đa: chưa giới hạn" : `Chi phí tối đa ước tính: ${liability.toLocaleString("vi-VN")}đ`}</p></div>
        </div>
      ) : null}
    </ResponsiveOverlay>
    <ConfirmModal isOpen={confirmOpen} title="Xác nhận phát hành voucher?" message={`${review}. ${draft.quantity === null ? "Số lượng phát hành chưa giới hạn." : `Phát hành tối đa ${draft.quantity} voucher.`} Quy tắc sẽ không thể sửa sau khi tạo.`} confirmLabel={props.submitting ? "Đang tạo…" : "Phát hành"} onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); props.onSubmit(buildVoucherInput(draft)); }} />
  </>;
}
