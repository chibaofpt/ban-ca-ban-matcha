"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import type {
  AdminVoucherRecipientPage,
  GrantVoucherInput,
  UpdateVoucherPackageInput,
  VoucherBundleProductScope,
  VoucherOwnerPage,
  VoucherOwnerStatus,
  VoucherPackage,
  VoucherRecipientStatus,
} from "@/src/services/adminVoucherService";
import { getVoucherPackageRecipientHistory, grantVoucherToCustomer } from "@/src/services/adminVoucherService";
import { searchVoucherPackageOwners } from "@/src/services/adminVoucherService";
import { searchCustomers, type CustomerSearchResult } from "@/src/services/staffOrderService";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { getVoucherPackageStatus, summarizeVoucherBenefit } from "@/src/lib/utils/adminVoucherPresentation";
import { formatInclusiveEndDate } from "@/src/lib/utils/adminVoucherForm";
import { formatSizeLabel } from "@/src/utils/display";

type EditableField = "name" | "description";
type ConfirmationState =
  | { kind: "closed" }
  | { kind: "discard" }
  | { kind: "discard-confirmed" }
  | { kind: "toggle" };
const RECIPIENT_STATUSES: VoucherRecipientStatus[] = ["ALL", "CURRENT", "USED"];
const RECIPIENT_STATUS_LABEL: Record<VoucherRecipientStatus, string> = { ALL: "Tất cả", CURRENT: "Đang có", USED: "Đã dùng" };
const OWNER_STATUSES: VoucherOwnerStatus[] = ["ALL", "ACTIVE", "RESERVED", "REDEEMED", "EXPIRED", "REFUNDED"];
const OWNER_STATUS_LABEL: Record<VoucherOwnerStatus, string> = { ALL: "Tất cả", ACTIVE: "Đang dùng", RESERVED: "Đã giữ", REDEEMED: "Đã dùng", EXPIRED: "Hết hạn", REFUNDED: "Đã hoàn" };
const VOUCHER_STATUS_LABEL: Record<AdminVoucherRecipientPage["vouchers"][number]["effective_status"], string> = {
  ACTIVE: "Đang hiệu lực",
  RESERVED: "Đang giữ cho đơn",
  REDEEMED: "Đã dùng",
  EXPIRED: "Hết hạn",
  REFUNDED: "Đã hoàn",
};
const ISSUED_VIA_LABEL: Record<AdminVoucherRecipientPage["vouchers"][number]["issued_via"], string> = {
  POINTS_EXCHANGE: "Đổi điểm",
  FREE_CLAIM: "Nhận miễn phí",
  AUTO_GRANT: "Tự động cấp",
  ADMIN: "Admin tặng",
};
const REWARD_MODE = { SAME_CONFIG: "Cùng cấu hình món mua", FIXED_CONFIG: "Cấu hình cố định", ALLOWED_SCOPE: "Chọn trong phạm vi" } as const;
const BENEFIT_SCALING = { PER_BUNDLE: "Theo mỗi combo", ONCE_PER_ORDER: "Một lần mỗi đơn", PER_QUALIFYING_ITEM: "Theo mỗi món đủ điều kiện" } as const;
type MenuItemLookup = ReadonlyMap<string, { label: string; category: "latte" | "fusion" | "extras" }>;
type LookupProps = { powderLabels?: ReadonlyMap<string, string>; baseLiquidLabels?: ReadonlyMap<string, string>; addonLabels?: ReadonlyMap<string, string>; menuItemLookup?: MenuItemLookup };

/** Renders package detail, inline editing, issuance controls, and owner search. */
export function AdminVoucherPackageDetail({ pkg, open, saving, onClose, onSave, onToggle, powderLabels = new Map(), baseLiquidLabels = new Map(), addonLabels = new Map(), menuItemLookup = new Map() }: { pkg: VoucherPackage | null; open: boolean; saving: boolean; onClose: () => void; onSave: (input: UpdateVoucherPackageInput) => Promise<void>; onToggle: () => Promise<void> } & LookupProps) {
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationState>({ kind: "closed" }); const [toggling, setToggling] = useState(false);
  const sessionKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const requestIdRef = useRef<string | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [submittedRecipientQuery, setSubmittedRecipientQuery] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<CustomerSearchResult | null>(null);
  const [historyStatus, setHistoryStatus] = useState<VoucherRecipientStatus>("ALL");
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningSummary, setWarningSummary] = useState<AdminVoucherRecipientPage["summary"] | null>(null);
  const [grantError, setGrantError] = useState("");
  const requestGeneration = useRef(0);
  const packageRef = useRef(pkg); packageRef.current = pkg;
  const [query, setQuery] = useState(""); const [submittedQuery, setSubmittedQuery] = useState(""); const [ownerStatus, setOwnerStatus] = useState<VoucherOwnerStatus>("ALL"); const [submittedStatus, setSubmittedStatus] = useState<VoucherOwnerStatus>("ALL");
  const [owners, setOwners] = useState<VoucherOwnerPage>({ users: [], next_cursor: null }); const [searching, setSearching] = useState(false); const [searchError, setSearchError] = useState("");
  const packageId = pkg?.id ?? "";
  const customerSearch = useQuery({
    queryKey: ["admin", "voucher-recipient-search", packageId, submittedRecipientQuery],
    queryFn: () => searchCustomers(submittedRecipientQuery),
    enabled: open && submittedRecipientQuery.length >= 2,
    staleTime: 30_000,
  });
  const recipientHistory = useInfiniteQuery({
    queryKey: selectedRecipient
      ? VOUCHER_QUERY_KEYS.ADMIN_VOUCHER_RECIPIENT(packageId, selectedRecipient.qr_token, historyStatus)
      : ["admin", "voucher-recipient-history", "empty"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getVoucherPackageRecipientHistory(packageId, selectedRecipient!.qr_token, {
      status: historyStatus,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (page) => page.meta.has_more ? page.meta.next_cursor ?? undefined : undefined,
    enabled: open && Boolean(packageId && selectedRecipient),
  });
  const recipientPages = recipientHistory.data?.pages ?? [];
  const recipientSummary = recipientPages[0]?.summary;
  const recipientVouchers = recipientPages.flatMap((page) => page.vouchers);
  const grantMutation = useMutation({
    mutationFn: async ({ acknowledge }: { acknowledge: boolean }) => {
      if (!packageId || !selectedRecipient) throw new Error("Chọn khách hàng trước khi tặng voucher");
      const requestId = requestIdRef.current ?? crypto.randomUUID();
      requestIdRef.current = requestId;
      const input: GrantVoucherInput = { user_qr_token: selectedRecipient.qr_token, request_id: requestId, ...(acknowledge ? { acknowledge_additional_gift: true } : {}) };
      return grantVoucherToCustomer(packageId, input);
    },
    onSuccess: (result) => {
      requestIdRef.current = null;
      setWarningOpen(false); setWarningSummary(null); setGrantError("");
      toast.success(result.already_granted ? "Yêu cầu tặng này đã được xử lý" : "Đã tặng 1 voucher");
      void queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.ADMIN_VOUCHER_PACKAGES });
      void queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES });
      if (selectedRecipient) void queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.ADMIN_VOUCHER_RECIPIENT(packageId, selectedRecipient.qr_token, historyStatus) });
    },
    onError: (caught) => {
      const details = caught && typeof caught === "object" && "details" in caught ? (caught as { details?: unknown }).details : undefined;
      const reason = details && typeof details === "object" && "reason" in details ? (details as { reason?: unknown }).reason : undefined;
      if (reason === "ADDITIONAL_GIFT_CONFIRMATION_REQUIRED") {
        const summary = details && typeof details === "object" && "summary" in details ? (details as { summary?: AdminVoucherRecipientPage["summary"] }).summary : undefined;
        setWarningSummary(summary ?? recipientSummary ?? null); setWarningOpen(true); setGrantError(""); return;
      }
      setGrantError(caught instanceof Error ? caught.message : "Không thể tặng voucher");
    },
  });
  useEffect(() => {
    const key = open && pkg ? pkg.id : null;
    if (sessionKey.current === key) return;
    sessionKey.current = key;
    requestIdRef.current = null;
    requestGeneration.current += 1;
    setSearching(false); setSearchError(""); setOwners({ users: [], next_cursor: null }); setSubmittedQuery(""); setQuery(""); setOwnerStatus("ALL"); setSubmittedStatus("ALL");
    setRecipientQuery(""); setSubmittedRecipientQuery(""); setSelectedRecipient(null); setHistoryStatus("ALL");
    setWarningOpen(false); setWarningSummary(null); setGrantError("");
    if (pkg && open) { setName(pkg.name); setDescription(pkg.description ?? ""); setEditing(null); setError(""); }
  }, [open, pkg]);
  if (!pkg) return null;
  const dirty = name !== pkg.name || description !== (pkg.description ?? "");
  const operationalStatus = getVoucherPackageStatus(pkg);
  const stats = pkg.stats ?? { issued_count: 0, active_count: 0, reserved_count: 0, redeemed_count: 0, expired_count: 0, refunded_count: 0, remaining_quantity: pkg.quantity };
  const selfAcquisitionCount = stats.self_acquisition_count ?? 0;
  const selfAcquisitionUsedCount = stats.self_acquisition_used_count ?? 0;
  const canToggle = operationalStatus === "ACTIVE" || operationalStatus === "PAUSED";
  const requestClose = () => dirty ? setConfirmation({ kind: "discard" }) : onClose();
  const handleConfirmationAfterClose = () => {
    if (confirmation.kind !== "discard-confirmed") return;
    setConfirmation({ kind: "closed" });
    onClose();
  };
  const saveField = async (field: EditableField) => { setError(""); try { await onSave(field === "name" ? { name: name.trim() } : { description: description.trim() || null }); setEditing(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể lưu thay đổi"); } };
  const submitRecipientSearch = () => {
    const nextQuery = recipientQuery.trim();
    if (nextQuery.length < 2) { setGrantError("Nhập ít nhất 2 ký tự để tìm khách hàng"); return; }
    requestIdRef.current = null;
    setSelectedRecipient(null); setWarningOpen(false); setWarningSummary(null); setGrantError("");
    setSubmittedRecipientQuery(nextQuery);
  };
  const selectRecipient = (recipient: CustomerSearchResult) => {
    if (grantMutation.isPending) return;
    requestIdRef.current = null;
    setSelectedRecipient(recipient); setHistoryStatus("ALL"); setWarningOpen(false); setWarningSummary(null); setGrantError("");
  };
  const requestGift = (acknowledge: boolean) => {
    if (!selectedRecipient || grantMutation.isPending) return;
    void grantMutation.mutate({ acknowledge });
  };
  const runOwnerSearch = async (cursor?: string) => {
    const q = cursor ? submittedQuery : query.trim(); const status = cursor ? submittedStatus : ownerStatus;
    if (q.length < 2) { setSearchError("Nhập ít nhất 2 ký tự"); return; }
    const generation = ++requestGeneration.current; setSearching(true); setSearchError("");
    try {
      const page = await searchVoucherPackageOwners(pkg.id, { q, status, ...(cursor ? { cursor } : {}) });
      if (generation !== requestGeneration.current) return;
      if (!cursor) { setSubmittedQuery(q); setSubmittedStatus(status); }
      setOwners((current) => ({ users: cursor ? [...current.users, ...page.users] : page.users, next_cursor: page.next_cursor }));
    } catch { if (generation === requestGeneration.current) setSearchError("Không thể tìm chủ sở hữu"); }
    finally { if (generation === requestGeneration.current) setSearching(false); }
  };
  const editor = (field: EditableField, value: string, setValue: (value: string) => void) => <div className="space-y-2"><div className="flex items-start gap-2">{editing === field ? <>{field === "description" ? <textarea aria-label="Mô tả" value={value} onChange={(event) => setValue(event.target.value)} className="min-h-24 flex-1 rounded-xl border p-3" /> : <input aria-label="Tên package" value={value} onChange={(event) => setValue(event.target.value)} className="h-11 flex-1 rounded-xl border px-3" />}<button type="button" className="grid h-10 w-10 place-items-center" onClick={() => saveField(field)} aria-label="Lưu"><Check /></button><button type="button" className="grid h-10 w-10 place-items-center" onClick={() => { setValue(field === "name" ? pkg.name : pkg.description ?? ""); setEditing(null); setError(""); }} aria-label="Huỷ sửa"><X /></button></> : <><p className="min-w-0 flex-1 whitespace-pre-wrap">{value || "Chưa có mô tả"}</p><button type="button" className="grid h-10 w-10 place-items-center" onClick={() => setEditing(field)} aria-label={`Sửa ${field === "name" ? "tên" : "mô tả"}`}><Pencil className="h-4 w-4" /></button></>}</div>{editing === field && error ? <p className="text-sm text-destructive">{error}</p> : null}</div>;
  const typeDetails = () => {
    if (pkg.voucher_type === "PRODUCT") return <div><p>Sản phẩm được chọn:</p>{(pkg.eligible_menu_items?.length ? pkg.eligible_menu_items : [{ menu_item_id: pkg.menu_item_id ?? "", name: pkg.menuItem?.name ?? "Không xác định", category: "latte" as const, is_available: pkg.menuItem?.is_available ?? false, is_seasonal: false, size: pkg.size, matcha_powder_id: pkg.matcha_powder_id, milk_type_id: pkg.milk_type_id, covered_price_vnd: pkg.covered_price_vnd }]).map((target) => <p key={target.menu_item_id}>• {target.name} · {target.size ? formatSizeLabel(target.size) : "Không có size"} · Bột {target.matcha_powder_id ? powderLabels.get(target.matcha_powder_id) ?? "không còn" : "cố định/mặc định"} · Base Liquid {target.milk_type_id ? baseLiquidLabels.get(target.milk_type_id) ?? "không còn" : "mặc định"} · Bao phủ {(target.covered_price_vnd ?? 0).toLocaleString("vi-VN")}đ</p>)}</div>;
    if (pkg.voucher_type === "PRODUCT_DISCOUNT") return <div><p>Món áp dụng: {(pkg.eligible_menu_items ?? []).map((item) => item.name).join(", ") || pkg.menuItem?.name}</p><p>Size: {(pkg.eligible_sizes ?? []).map(formatSizeLabel).join(", ")} · Chế độ {pkg.product_discount_mode === "PAY_AS_SIZE" ? `Trả theo size ${pkg.reference_size ? formatSizeLabel(pkg.reference_size) : "tham chiếu"}` : `Giảm cố định ${(pkg.discount_value ?? 0).toLocaleString("vi-VN")}đ`}</p></div>;
    if (pkg.voucher_type === "BUNDLE" && pkg.bundleRule) { const scopeLabel = (scope: VoucherBundleProductScope) => { const lookup = menuItemLookup.get(scope.menu_item_id); const name = scope.menu_item?.name ?? lookup?.label ?? "Không còn trong danh mục"; if ((scope.menu_item?.category ?? lookup?.category) === "extras") return name; return `${name} (${scope.allowed_sizes.map(formatSizeLabel).join("/")}; bột ${scope.default_powder_id ? powderLabels.get(scope.default_powder_id) ?? "không còn" : "mặc định"}; Base Liquid ${scope.default_base_liquid_id ? baseLiquidLabels.get(scope.default_base_liquid_id) ?? "không còn" : "mặc định"})`; }; const rewardLabel = pkg.bundleRule.reward_kind === "PRODUCT" ? pkg.bundleRule.reward_mode === "SAME_CONFIG" ? "Cùng món mua và cấu hình" : pkg.bundleRule.reward_products.map(scopeLabel).join(", ") : pkg.bundleRule.reward_addon_option_ids.map((id) => addonLabels.get(id) ?? "Addon không còn trong danh mục").join(", "); return <div><p>Cách nhận thưởng: {REWARD_MODE[pkg.bundleRule.reward_mode]} · {BENEFIT_SCALING[pkg.bundleRule.benefit_scaling]}</p><p>Món mua: {pkg.bundleRule.qualifier_products.map(scopeLabel).join(", ") || "Không có"}</p><p>Phần thưởng: {rewardLabel} · Tối đa {pkg.bundleRule.max_applications_per_order} lần/đơn{pkg.bundleRule.max_reward_units_per_order ? ` · ${pkg.bundleRule.max_reward_units_per_order} phần thưởng/đơn` : ""}</p></div>; }
    if (pkg.voucher_type === "ADDON") return <p>Addon áp dụng: {pkg.eligible_addon_options?.map((option) => option.label).join(", ") || pkg.addonOption?.label || (pkg.addon_option_id ? addonLabels.get(pkg.addon_option_id) : null) || "Không còn trong danh mục"}</p>;
    if (pkg.voucher_type === "ITEM") return <p>Món tặng: {pkg.eligible_menu_items?.map((item) => item.name).join(", ") || pkg.menuItem?.name || (pkg.menu_item_id ? menuItemLookup.get(pkg.menu_item_id)?.label : null) || "Không còn trong danh mục"}</p>;
    if (pkg.voucher_type === "DISCOUNT") return <p>{pkg.discount_type === "PERCENT" ? `Giảm ${pkg.discount_value}%` : `Giảm ${(pkg.discount_value ?? 0).toLocaleString("vi-VN")}đ`}</p>;
    return <p>Hỗ trợ tối đa {(pkg.covered_delivery_fee_vnd ?? 0).toLocaleString("vi-VN")}đ phí giao</p>;
  };
  return <><ResponsiveOverlay open={open} onOpenChange={(next) => { if (!next) requestClose(); }} title="Chi tiết package" description="Theo dõi phát hành và người sở hữu" size="lg" dismissPolicy={saving ? "locked-while-busy" : "default"} busy={saving} footer={canToggle ? <button type="button" disabled={saving || toggling} onClick={() => setConfirmation({ kind: "toggle" })} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">{(saving || toggling) ? <Loader2 className="h-4 w-4 animate-spin" /> : pkg.is_active ? "Tạm dừng phát hành" : "Tiếp tục phát hành"}</button> : undefined}>
    <div className="space-y-6">
      <section className="space-y-3">{editor("name", name, setName)}{editor("description", description, setDescription)}<div className="space-y-2 rounded-xl bg-muted p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><span className={pkg.visibility === "PRIVATE" ? "rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800" : "rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800"}>{pkg.visibility === "PRIVATE" ? "Riêng tư" : "Công khai"}</span><span className="text-muted-foreground">{pkg.visibility === "PRIVATE" || pkg.acquisition_mode === "NONE" ? "Admin tặng trực tiếp" : pkg.acquisition_mode === "POINTS_EXCHANGE" ? `Đổi ${pkg.points_cost} điểm` : pkg.acquisition_mode === "AUTO_GRANT" ? "Tự động cấp" : "Nhận miễn phí"}</span></div><p>{summarizeVoucherBenefit(pkg)}</p>{typeDetails()}</div></section>
      <section className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border p-3">Đã cấp {stats.issued_count}</div><div className="rounded-xl border p-3">Đã dùng {stats.redeemed_count}</div><div className="rounded-xl border p-3">Còn lại {stats.remaining_quantity === null ? "Không giới hạn" : stats.remaining_quantity}</div><div className="rounded-xl border p-3">Đang hiệu lực {stats.active_count}</div><div className="rounded-xl border p-3">Đã giữ {stats.reserved_count}</div><div className="rounded-xl border p-3">Hết hạn {stats.expired_count}</div><div className="rounded-xl border p-3">Đã hoàn {stats.refunded_count}</div><div className="rounded-xl border p-3">Mỗi khách tối đa {pkg.max_per_user}</div><div className="col-span-2 rounded-xl border border-primary/30 bg-primary/5 p-3">Số lượt khách được tự nhận/đổi: {selfAcquisitionCount} · Đã dùng: {selfAcquisitionUsedCount}</div></section>
      <section className="space-y-2 text-sm"><h3 className="font-bold">Điều kiện & thời hạn</h3><p>{pkg.min_order_vnd ? `Đơn tối thiểu ${pkg.min_order_vnd.toLocaleString("vi-VN")}đ` : "Không yêu cầu giá trị đơn tối thiểu"}</p><p>{pkg.ends_at ? `Hạn phát hành: ${formatInclusiveEndDate(pkg.ends_at)}` : "Không giới hạn hạn phát hành"} · {pkg.expires_after_days ? `Có hiệu lực ${pkg.expires_after_days} ngày sau cấp` : "Không giới hạn hiệu lực"}</p></section>
      <section className="space-y-3 rounded-2xl border border-primary/20 p-4"><div><h3 className="font-bold">Tặng cho khách hàng</h3><p className="mt-1 text-sm text-muted-foreground">{pkg.visibility === "PRIVATE" ? "Gói riêng tư chỉ được phát hành bằng thao tác tặng của admin." : "Chọn đúng khách hàng trước khi tặng; mỗi lần bấm sẽ tạo một request riêng."}</p></div>
        <form onSubmit={(event) => { event.preventDefault(); submitRecipientSearch(); }} className="flex gap-2"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4 shrink-0" /><span className="sr-only">Tìm theo tên hoặc số điện thoại</span><input value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Tìm theo tên hoặc số điện thoại" className="min-w-0 flex-1 bg-transparent outline-none" /></label><button type="submit" disabled={customerSearch.isFetching || grantMutation.isPending} className="grid h-11 min-w-16 place-items-center rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-60">{customerSearch.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tìm"}</button></form>
        {customerSearch.error ? <p className="text-sm text-destructive">Không thể tìm khách hàng</p> : null}
        {submittedRecipientQuery ? customerSearch.data?.map((customer) => <button key={customer.qr_token} type="button" disabled={grantMutation.isPending} onClick={() => selectRecipient(customer)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left disabled:opacity-60 ${selectedRecipient?.qr_token === customer.qr_token ? "border-primary bg-primary/10" : "border-input"}`}><span><strong className="block">{customer.name}</strong><span className="text-xs text-muted-foreground">{customer.phone_number}</span></span><span className="text-xs font-semibold text-primary">Chọn</span></button>) : null}
        {selectedRecipient ? <div className="space-y-3 rounded-xl bg-muted p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">Đã chọn: {selectedRecipient.name}</p><p className="text-xs text-muted-foreground">{selectedRecipient.phone_number}</p></div><button type="button" disabled={grantMutation.isPending} onClick={() => void recipientHistory.refetch()} className="text-xs font-semibold text-primary">Làm mới</button></div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span>Đang có: {recipientSummary?.current_count ?? "—"}</span><span>Đã dùng: {recipientSummary?.used_count ?? "—"}</span><span>Khách tự nhận/đổi: {recipientSummary?.self_acquisition_count ?? "—"}</span><span>Kho còn: {recipientSummary?.global_remaining ?? "—"}</span></div>
          {recipientSummary?.warning_reasons.length ? <p className="text-xs text-amber-700">Khách đã có voucher hoặc đã đạt giới hạn tự nhận/đổi; thao tác này cần xác nhận thêm.</p> : null}
          <button type="button" disabled={grantMutation.isPending || recipientHistory.isLoading || recipientSummary?.grant_eligible === false} onClick={() => requestGift(false)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60">{grantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Tặng 1 voucher cho ${selectedRecipient.name}`}</button>
          {grantError ? <p className="text-sm text-destructive">{grantError}</p> : null}
          {recipientHistory.isLoading ? <p className="text-xs text-muted-foreground">Đang tải lịch sử…</p> : recipientHistory.error ? <p className="text-sm text-destructive">Không thể tải lịch sử voucher</p> : <>
            <div className="grid grid-cols-3 gap-2">{RECIPIENT_STATUSES.map((status) => <button key={status} type="button" disabled={grantMutation.isPending} onClick={() => setHistoryStatus(status)} className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${historyStatus === status ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{RECIPIENT_STATUS_LABEL[status]}</button>)}</div>
            <div className="space-y-2">{recipientVouchers.map((voucher) => <article key={voucher.qr_token} className="rounded-lg border bg-background p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>{ISSUED_VIA_LABEL[voucher.issued_via]}</strong><span className="font-semibold">{VOUCHER_STATUS_LABEL[voucher.effective_status]}</span></div><p className="mt-1 text-muted-foreground">Nhận {new Date(voucher.created_at).toLocaleDateString("vi-VN")} · Hạn {voucher.expires_at ? new Date(voucher.expires_at).toLocaleDateString("vi-VN") : "Không giới hạn"}</p></article>)}</div>
            {recipientHistory.hasNextPage ? <button type="button" disabled={recipientHistory.isFetchingNextPage || grantMutation.isPending} onClick={() => void recipientHistory.fetchNextPage()} className="h-10 w-full rounded-lg border text-xs font-semibold">{recipientHistory.isFetchingNextPage ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Tải thêm"}</button> : null}
          </>}
        </div> : null}
      </section>
      <section className="space-y-3"><h3 className="font-bold">Tìm chủ sở hữu</h3><form onSubmit={(event) => { event.preventDefault(); void runOwnerSearch(); }} className="flex gap-2"><label className="flex h-11 flex-1 items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4" /><span className="sr-only">Tên, Instagram hoặc số điện thoại</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, Instagram, số điện thoại" className="min-w-0 flex-1 bg-transparent outline-none" /></label><button disabled={searching} aria-label={searching ? "Đang tìm" : "Tìm"} className="grid h-11 min-w-16 place-items-center rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-60">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tìm"}</button></form>
        <select aria-label="Trạng thái voucher" value={ownerStatus} onChange={(event) => { requestGeneration.current += 1; setSearching(false); setOwnerStatus(event.target.value as VoucherOwnerStatus); setOwners({ users: [], next_cursor: null }); setSubmittedQuery(""); }} className="h-11 w-full rounded-xl border bg-background px-3">{OWNER_STATUSES.map((status) => <option key={status} value={status}>{OWNER_STATUS_LABEL[status]}</option>)}</select>
        {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}{owners.users.map((owner) => <article key={owner.qr_token} className="rounded-xl border p-3"><p className="font-semibold">{owner.name}</p><p className="text-xs text-muted-foreground">{owner.insta_name ? `@${owner.insta_name} · ` : ""}{owner.phone_number}</p><div className="mt-2 space-y-1">{owner.vouchers.map((voucher) => <p key={voucher.qr_token} className="text-xs">{voucher.effective_status} · {new Date(voucher.created_at).toLocaleDateString("vi-VN")}</p>)}</div></article>)}
        {owners.next_cursor ? <button type="button" disabled={searching} onClick={() => void runOwnerSearch(owners.next_cursor ?? undefined)} className="h-11 w-full rounded-xl border">{searching ? <Loader2 className="mx-auto animate-spin" /> : "Tải thêm"}</button> : null}
      </section>
    </div>
  </ResponsiveOverlay><ConfirmModal isOpen={confirmation.kind === "discard"} title="Bỏ thay đổi chưa lưu?" message="Tên hoặc mô tả đang có thay đổi chưa lưu." isDestructive confirmLabel="Bỏ thay đổi" onCancel={() => setConfirmation({ kind: "closed" })} onAfterClose={handleConfirmationAfterClose} onConfirm={() => setConfirmation({ kind: "discard-confirmed" })} /><ConfirmModal isOpen={confirmation.kind === "toggle"} title={pkg.is_active ? "Tạm dừng phát hành?" : "Tiếp tục phát hành?"} message={pkg.is_active ? "Voucher đã cấp vẫn dùng được; chỉ dừng cấp mới." : "Khách phù hợp có thể nhận voucher trở lại."} isDestructive={pkg.is_active} isLoading={toggling} onCancel={() => { if (!toggling) setConfirmation({ kind: "closed" }); }} onAfterClose={handleConfirmationAfterClose} onConfirm={() => { setToggling(true); void onToggle().finally(() => { setToggling(false); setConfirmation({ kind: "closed" }); }); }} /><ConfirmModal isOpen={warningOpen} title="Xác nhận tặng thêm voucher" message="Khách hàng đã có voucher hoặc đã đạt giới hạn tự nhận/đổi. Hãy xác nhận để tiếp tục tặng một voucher." confirmLabel="Vẫn tặng 1 voucher" isLoading={grantMutation.isPending} onCancel={() => setWarningOpen(false)} onConfirm={() => { setWarningOpen(false); requestGift(true); }}>{warningSummary ? <div className="space-y-2 text-sm"><p>Đang có: {warningSummary.current_count} · Đã dùng: {warningSummary.used_count}</p><p>Khách tự nhận/đổi: {warningSummary.self_acquisition_count}{warningSummary.self_acquisition_limit === null ? " · Không giới hạn" : `/${warningSummary.self_acquisition_limit}`}</p><p>Kho còn: {warningSummary.global_remaining === null ? "Không giới hạn" : warningSummary.global_remaining} · Hạn dự kiến: {warningSummary.expiry_preview ? new Date(warningSummary.expiry_preview).toLocaleDateString("vi-VN") : "Không giới hạn"}</p></div> : null}</ConfirmModal></>;
}
