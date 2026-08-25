"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, Search, ToggleLeft, ToggleRight } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { VoucherWizard } from "@/src/components/admin/VoucherWizard";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import {
  createVoucherPackage,
  listVoucherPackages,
  updateVoucherPackage,
  type CreateVoucherPackageInput,
  type VoucherPackage,
} from "@/src/services/adminVoucherService";
import { cn } from "@/src/utils/cn";
import { formatInclusiveEndDate } from "@/src/lib/utils/adminVoucherForm";

const TYPE_LABEL: Record<VoucherPackage["voucher_type"], string> = {
  PRODUCT_DISCOUNT: "Giảm theo món",
  ITEM: "Add-on", BUNDLE: "Mua X tặng Y", PRODUCT: "Sản phẩm", ADDON: "Addon",
  DISCOUNT: "Giảm giá", FREESHIP: "Freeship",
};

function errorMessage(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) return error.response?.data?.error ?? "Thao tác thất bại";
  return error instanceof Error ? error.message : "Thao tác thất bại";
}

function packageBenefit(pkg: VoucherPackage): string {
  if (pkg.voucher_type === "BUNDLE" && pkg.bundleRule) return `Mua ${pkg.bundleRule.buy_quantity} tặng ${pkg.bundleRule.reward_quantity} ${pkg.bundleRule.reward_kind === "PRODUCT" ? "món" : "addon"}`;
  if (pkg.voucher_type === "DISCOUNT") return pkg.discount_type === "PERCENT" ? `Giảm ${pkg.discount_value}%` : `Giảm ${(pkg.discount_value ?? 0).toLocaleString("vi-VN")}đ`;
  if (pkg.voucher_type === "ITEM") return `Tặng ${pkg.menuItem?.name ?? "Add-on"}`;
  if (pkg.voucher_type === "PRODUCT") return `Tặng ${pkg.menuItem?.name ?? "sản phẩm"}`;
  if (pkg.voucher_type === "ADDON") return `Tặng ${pkg.addonOption?.label ?? "addon"}`;
  return `Hỗ trợ ${(pkg.covered_delivery_fee_vnd ?? 0).toLocaleString("vi-VN")}đ phí giao`;
}

function VoucherCard({ pkg, onToggle }: { pkg: VoucherPackage; onToggle: (pkg: VoucherPackage) => void }) {
  return <article className={cn("rounded-2xl border bg-card p-4 shadow-sm", !pkg.is_active && "opacity-60")}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">{TYPE_LABEL[pkg.voucher_type]}</span><span className="text-xs text-muted-foreground">{pkg.acquisition_mode === "POINTS_EXCHANGE" ? `${pkg.points_cost} điểm` : pkg.acquisition_mode === "AUTO_GRANT" ? "Tự có trong ví" : "Nhận miễn phí"}</span></div><h2 className="truncate font-bold">{pkg.name}</h2><p className="mt-1 text-sm text-muted-foreground">{packageBenefit(pkg)}</p></div><button type="button" onClick={() => onToggle(pkg)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label={pkg.is_active ? "Ngừng phát hành" : "Phát hành lại"}>{pkg.is_active ? <ToggleRight className="text-primary" /> : <ToggleLeft />}</button></div>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{pkg.ends_at ? `Dùng đến hết ${formatInclusiveEndDate(pkg.ends_at)}` : "Không giới hạn ngày"}</span><span>Tối đa {pkg.max_per_user}/khách</span>{pkg.min_order_vnd ? <span>Đơn từ {pkg.min_order_vnd.toLocaleString("vi-VN")}đ</span> : null}</div>
  </article>;
}

/** Unified admin hub for voucher packages and BUNDLE campaigns. */
export default function AdminVoucherPackagesPage() {
  const queryClient = useQueryClient(); const [wizardOpen, setWizardOpen] = useState(false);
  const [query, setQuery] = useState(""); const [type, setType] = useState<"ALL" | VoucherPackage["voucher_type"]>("ALL");
  const [pendingToggle, setPendingToggle] = useState<VoucherPackage | null>(null);
  const { data: packages = [], isLoading } = useQuery({ queryKey: ["admin", "voucher-packages"], queryFn: listVoucherPackages });
  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: fetchMenu });
  const { data: powders } = useQuery({ queryKey: ["admin", "powders", "raw"], queryFn: fetchPowders });
  const createMutation = useMutation({ mutationFn: createVoucherPackage, onSuccess: (created) => { queryClient.setQueryData<VoucherPackage[]>(["admin", "voucher-packages"], (current = []) => [created, ...current]); setWizardOpen(false); toast.success("Đã tạo voucher"); }, onError: (error) => toast.error(errorMessage(error)) });
  const toggleMutation = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateVoucherPackage(id, { is_active: isActive }), onSuccess: (updated) => { queryClient.setQueryData<VoucherPackage[]>(["admin", "voucher-packages"], (current = []) => current.map((pkg) => pkg.id === updated.id ? { ...pkg, ...updated } : pkg)); setPendingToggle(null); toast.success(updated.is_active ? "Đã phát hành lại" : "Đã ngừng phát hành"); }, onError: (error) => toast.error(errorMessage(error)) });
  const filtered = useMemo(() => packages.filter((pkg) => (type === "ALL" || pkg.voucher_type === type) && pkg.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))), [packages, query, type]);
  const menuItems = [...(menu?.latte ?? []), ...(menu?.fusion ?? []), ...(menu?.extras ?? [])];
  const menuOptions = menuItems.map((item) => ({ value: item.id, label: item.name, description: item.is_seasonal ? "Theo mùa" : item.category === "latte" ? "Latte" : item.category === "fusion" ? "Fusion" : "Add-on" }));
  const bundleMenuItems = menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    availableSizes: item.sizes.map((size) => size.size),
    fixedPowderId: item.category === "latte" ? item.powder?.id ?? null : null,
    availablePowderIds: item.category === "latte"
      ? item.powder ? [item.powder.id] : []
      : [...new Set([item.resolved_default_powder_id, ...(item.allowed_powder_ids ?? [])].filter((id): id is string => Boolean(id)))],
    availableBaseLiquidIds: [...new Set([
      item.default_base_liquid_id,
      ...(item.allowed_base_liquid_ids ?? []),
    ].filter((id): id is string => Boolean(id)))],
    isSeasonal: item.is_seasonal,
  }));
  const addonOptions = (menu?.addon_groups ?? []).flatMap((group) => group.options.filter((option) => option.gram_value === null).map((option) => ({ value: option.id, label: option.label, description: group.name })));
  const powderOptions = (powders?.data ?? []).map((powder) => ({ value: powder.id, label: powder.name }));
  const milkOptions = (menu?.milk_types ?? []).map((milk) => ({ value: milk.id, label: milk.name }));
  const menuPriceById = new Map(menuItems.map((item) => [item.id, item.unit_price_vnd ?? Math.max(0, ...item.sizes.map((size) => size.base_price_vnd ?? 0))]));
  const addonPriceById = new Map((menu?.addon_groups ?? []).flatMap((group) => group.options.map((option) => [option.id, option.price_vnd] as const)));
  const submit = (input: CreateVoucherPackageInput) => createMutation.mutate(input);
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 pb-28 md:px-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">Voucher & ưu đãi</p><h1 className="text-2xl font-bold">Quản lý phát hành</h1><p className="mt-1 text-sm text-muted-foreground">Tạo voucher đổi điểm, nhận miễn phí hoặc tự có trong ví tại cùng một nơi.</p></div><button type="button" onClick={() => setWizardOpen(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Tạo voucher</button></header>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-card p-4"><span className="text-xs text-muted-foreground">Đang phát hành</span><strong className="mt-1 block text-2xl">{packages.filter((pkg) => pkg.is_active).length}</strong></div><div className="rounded-2xl border bg-card p-4"><span className="text-xs text-muted-foreground">Mua X tặng Y</span><strong className="mt-1 block text-2xl">{packages.filter((pkg) => pkg.voucher_type === "BUNDLE").length}</strong></div><div className="col-span-2 rounded-2xl border bg-card p-4 sm:col-span-1"><span className="text-xs text-muted-foreground">Tổng cấu hình</span><strong className="mt-1 block text-2xl">{packages.length}</strong></div></section>
    <section className="space-y-3"><div className="flex gap-2 overflow-x-auto pb-1">{(["ALL", "ITEM", "BUNDLE", "PRODUCT", "ADDON", "DISCOUNT", "FREESHIP"] as const).map((value) => <button type="button" key={value} onClick={() => setType(value)} className={cn("h-11 shrink-0 rounded-full border px-4 text-sm font-semibold", type === value && "border-primary bg-primary text-primary-foreground")}>{value === "ALL" ? "Tất cả" : TYPE_LABEL[value]}</button>)}</div><label className="flex h-11 items-center gap-2 rounded-xl border bg-background px-3"><Search className="h-4 w-4 text-muted-foreground" /><span className="sr-only">Tìm voucher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên voucher" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></section>
    {isLoading ? <p className="py-12 text-center text-muted-foreground">Đang tải…</p> : filtered.length === 0 ? <div className="grid place-items-center rounded-2xl border border-dashed py-16 text-center"><Gift className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">Chưa có voucher phù hợp</p></div> : <section className="grid gap-3 md:grid-cols-2">{filtered.map((pkg) => <VoucherCard key={pkg.id} pkg={pkg} onToggle={setPendingToggle} />)}</section>}
    <VoucherWizard open={wizardOpen} onOpenChange={setWizardOpen} menuOptions={menuOptions} bundleMenuItems={bundleMenuItems} addonOptions={addonOptions} powderOptions={powderOptions} milkOptions={milkOptions} menuPriceById={menuPriceById} addonPriceById={addonPriceById} submitting={createMutation.isPending} onSubmit={submit} />
    <ConfirmModal isOpen={Boolean(pendingToggle)} onCancel={() => setPendingToggle(null)} onConfirm={() => pendingToggle && toggleMutation.mutate({ id: pendingToggle.id, isActive: !pendingToggle.is_active })} title={pendingToggle?.is_active ? "Ngừng phát hành voucher?" : "Phát hành lại voucher?"} message={pendingToggle?.is_active ? "Voucher đã cấp vẫn có thể dùng; chỉ dừng cấp mới." : "Khách phù hợp có thể nhận voucher này trở lại."} confirmLabel={toggleMutation.isPending ? "Đang xử lý…" : "Xác nhận"} isDestructive={Boolean(pendingToggle?.is_active)} />
  </main>;
}
