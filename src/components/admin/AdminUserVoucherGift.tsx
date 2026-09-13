"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Gift, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AdminUserVoucherCategory, AdminUserVoucherPackage } from "@/src/lib/types/adminUser";
import { ApiServiceError } from "@/src/services/orderService";
import { grantVoucherToCustomer } from "@/src/services/adminVoucherService";
import { adminUserKeys, fetchAdminUserVoucherPackages } from "@/src/services/adminUserService";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { Button } from "@/src/components/ui/button";
import { AdminUserPagination } from "@/src/components/admin/AdminUserPagination";

interface AdminUserVoucherGiftProps { userQrToken: string; onGifted: () => Promise<void> | void; onBusyChange?: (busy: boolean) => void }
const categories: Array<{ value: AdminUserVoucherCategory; label: string }> = [{ value: "ALL", label: "Tất cả" }, { value: "DISCOUNT", label: "Giảm giá" }, { value: "GIFT", label: "Tặng món" }, { value: "SHIPPING", label: "Shipping" }];

/** Lets an admin choose and safely grant an active voucher package. */
export function AdminUserVoucherGift({ userQrToken, onGifted, onBusyChange }: AdminUserVoucherGiftProps) {
  const [category, setCategory] = useState<AdminUserVoucherCategory>("ALL");
  const [page, setPage] = useState(1);
  const [intent, setIntent] = useState<{ pkg: AdminUserVoucherPackage; requestId: string } | null>(null);
  const [warningDetails, setWarningDetails] = useState<unknown>(null);
  const query = useQuery({ queryKey: adminUserKeys.packages(page, category), queryFn: () => fetchAdminUserVoucherPackages(page, category) });
  const mutation = useMutation({
    mutationFn: ({ giftIntent, acknowledge }: { giftIntent: { pkg: AdminUserVoucherPackage; requestId: string }; acknowledge: boolean }) => {
      return grantVoucherToCustomer(giftIntent.pkg.id, { user_qr_token: userQrToken, request_id: giftIntent.requestId, ...(acknowledge ? { acknowledge_additional_gift: true } : {}) });
    },
    onSuccess: async (result) => { toast.success(result.already_granted ? "Yêu cầu tặng này đã được xử lý" : "Đã tặng 1 voucher"); setWarningDetails(null); setIntent(null); await onGifted(); },
    onError: (error) => {
      if (error instanceof ApiServiceError && error.code === "BUSINESS_RULE_VIOLATION" && isAdditionalWarning(error.details)) { setWarningDetails(error.details); return; }
      toast.error(error instanceof Error ? error.message : "Không thể tặng voucher");
    },
  });
  useEffect(() => { onBusyChange?.(mutation.isPending); }, [mutation.isPending, onBusyChange]);
  const begin = (pkg: AdminUserVoucherPackage) => { const giftIntent = { pkg, requestId: crypto.randomUUID() }; setWarningDetails(null); setIntent(giftIntent); mutation.mutate({ giftIntent, acknowledge: false }); };
  return <section className="space-y-3 rounded-2xl border border-border p-4">
    <div><p className="font-semibold">Tặng voucher</p><p className="text-sm text-muted-foreground">10 package mới nhất đang hoạt động</p></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Loại voucher">{categories.map((item) => <Button key={item.value} size="sm" variant={category === item.value ? "primary" : "outline"} disabled={mutation.isPending} onClick={() => { setCategory(item.value); setPage(1); }}>{item.label}</Button>)}</div>
    {query.isLoading ? <div className="flex justify-center p-6"><Loader2 className="animate-spin" aria-label="Đang tải package" /></div> : query.isError ? <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Không thể tải package.<button className="ml-2 underline" onClick={() => query.refetch()}>Thử lại</button></div> : !query.data?.items.length ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Không có package phù hợp.</p> : <ul className="divide-y divide-border">{query.data.items.map((pkg) => <PackageRow key={pkg.id} pkg={pkg} pending={mutation.isPending} onGift={() => begin(pkg)} />)}</ul>}
    {query.data ? <AdminUserPagination page={query.data.page} totalPages={query.data.total_pages} disabled={query.isFetching || mutation.isPending} onPageChange={setPage} /> : null}
    <ConfirmModal isOpen={warningDetails !== null} title="Xác nhận tặng thêm voucher" message="Khách đang có voucher hoặc đã đạt giới hạn tự nhận/đổi. Xác nhận để tặng thêm một voucher." confirmLabel="Vẫn tặng 1 voucher" isLoading={mutation.isPending} onCancel={() => { if (!mutation.isPending) { setWarningDetails(null); setIntent(null); } }} onConfirm={() => { if (intent) mutation.mutate({ giftIntent: intent, acknowledge: true }); }}><WarningDetails details={warningDetails} /></ConfirmModal>
  </section>;
}

function PackageRow({ pkg, pending, onGift }: { pkg: AdminUserVoucherPackage; pending: boolean; onGift: () => void }) { return <li className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{pkg.name}</p>{pkg.description ? <p className="text-sm text-muted-foreground">{pkg.description}</p> : null}</div><Button size="sm" disabled={pending} onClick={onGift} className="shrink-0 gap-1"><Gift className="h-4 w-4" />Tặng</Button></li>; }
function isAdditionalWarning(details: unknown): boolean { return typeof details === "object" && details !== null && "reason" in details && (details as { reason?: unknown }).reason === "ADDITIONAL_GIFT_CONFIRMATION_REQUIRED"; }
function WarningDetails({ details }: { details: unknown }) { const summary = typeof details === "object" && details !== null && "summary" in details ? (details as { summary?: unknown }).summary : details; return <div className="space-y-2 text-sm text-primary/70"><p>Khách đang có ưu đãi hoặc đã đạt giới hạn nhận công khai. Máy chủ sẽ kiểm tra lại tồn kho và hiệu lực khi xác nhận.</p>{typeof summary === "object" && summary !== null ? <p className="rounded-xl bg-accent/40 p-3">Chi tiết xác nhận đã được giữ nguyên từ máy chủ.</p> : null}</div>; }
