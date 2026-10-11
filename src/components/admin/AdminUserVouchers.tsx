"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AdminUserVoucher } from "@/src/lib/types/adminUser";
import { adminUserKeys, fetchAdminUserVouchers, refundAdminUserVoucher } from "@/src/services/adminUserService";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { AdminUserPagination } from "@/src/components/admin/AdminUserPagination";
import { cn } from "@/src/utils/cn";

interface AdminUserVouchersProps {
  userQrToken: string;
  page: number;
  onPageChange: (page: number) => void;
  onBusyChange?: (busy: boolean) => void;
}
const statusText: Record<string, string> = { ACTIVE: "Chưa sử dụng", REDEEMED: "Đã sử dụng", EXPIRED: "Đã hết hạn", RESERVED: "Đang treo để order", REFUNDED: "Đã hoàn điểm" };
const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

function VoucherRow({ voucher, disabled, onRefund }: { voucher: AdminUserVoucher; disabled: boolean; onRefund: () => void }) {
  const statusClass = voucher.status === "ACTIVE" ? "text-emerald-700" : voucher.status === "RESERVED" ? "text-amber-700"
    : voucher.status === "REFUNDED" ? "text-muted-foreground" : "text-destructive";
  const dayClass = voucher.days_remaining === null ? "text-muted-foreground" : voucher.days_remaining <= 4 ? "text-destructive" : voucher.days_remaining <= 14 ? "text-amber-700" : "text-emerald-700";
  const expiresAt = voucher.expires_at ? dateTime.format(new Date(voucher.expires_at)) : null;
  const days = voucher.days_remaining === null
    ? "Không hết hạn"
    : voucher.status === "EXPIRED"
      ? expiresAt ? `Hết hạn lúc ${expiresAt}` : "Đã hết hạn"
      : voucher.days_remaining === 0
        ? voucher.status === "ACTIVE"
          ? "Hết hạn hôm nay"
          : expiresAt ? `Hạn dùng ${expiresAt}` : "Đã hết hạn"
        : `Còn ${voucher.days_remaining} ngày`;
  return <li className="space-y-2 rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="break-words font-medium">{voucher.name}</p>{voucher.description ? <p className="break-words text-sm text-muted-foreground">{voucher.description}</p> : null}</div>
      <div className="shrink-0 text-right text-xs"><p className={cn("font-medium", statusClass)}>{statusText[voucher.status] ?? voucher.status}</p><p className={cn("mt-1", dayClass)}>{days}</p></div>
    </div>
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 text-xs text-muted-foreground">{voucher.issued_via === "POINTS_EXCHANGE" ? "Đổi lúc" : "Nhận lúc"} {dateTime.format(new Date(voucher.created_at))}</p>
      {voucher.can_refund ? <button type="button" disabled={disabled} onClick={onRefund} aria-label={`Hoàn điểm voucher ${voucher.name}`} className="flex min-h-11 shrink-0 items-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-500/20 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Hoàn điểm</button> : null}
    </div>
  </li>;
}

/** Displays a paginated customer voucher wallet with effective status labels. */
export function AdminUserVouchers({ userQrToken, page, onPageChange, onBusyChange }: AdminUserVouchersProps) {
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<AdminUserVoucher | null>(null);
  const submitting = useRef(false);
  const query = useQuery({ queryKey: adminUserKeys.vouchers(userQrToken, page), queryFn: () => fetchAdminUserVouchers(userQrToken, page) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminUserKeys.all }, { throwOnError: true });
  const mutation = useMutation({
    mutationFn: (voucher: AdminUserVoucher) => refundAdminUserVoucher(userQrToken, voucher.qr_token),
    onSuccess: async (result) => {
      setIntent(null);
      queryClient.setQueryData<typeof query.data>(adminUserKeys.vouchers(userQrToken, page), (current) => current ? {
        ...current, items: current.items.map((voucher) => voucher.qr_token === result.qr_token
          ? { ...voucher, status: result.status, can_refund: false, refundable_points: null } : voucher),
      } : current);
      toast.success(`Đã hoàn ${result.points_refunded.toLocaleString("vi-VN")} điểm và thu hồi voucher`);
      try { await refresh(); } catch { toast.error("Đã hoàn điểm nhưng chưa thể làm mới thông tin khách hàng và voucher."); }
    },
    onError: async (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể hoàn điểm voucher");
      if (error instanceof ApiServiceError && [404, 409, 422].includes(error.status)) {
        setIntent(null);
        try { await refresh(); } catch { toast.error("Chưa thể làm mới danh sách voucher. Hãy thử tải lại."); }
      }
    },
    onSettled: () => { submitting.current = false; onBusyChange?.(false); },
  });
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  function confirmRefund() {
    if (!intent || submitting.current || mutation.isPending) return;
    submitting.current = true;
    onBusyChange?.(true);
    mutation.mutate(intent);
  }
  return <div className="space-y-4">
    {query.isLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin" aria-label="Đang tải voucher" /></div>
      : query.isError && !query.data ? <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"><p>Không thể tải voucher.</p><ButtonRetry onClick={() => query.refetch()} /></div>
        : !query.data?.items.length ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Khách chưa có voucher.</p>
          : <><ul className="space-y-3">{query.data.items.map((voucher) => <VoucherRow key={voucher.qr_token} voucher={voucher} disabled={mutation.isPending || query.isFetching || query.isError} onRefund={() => { if (!submitting.current && !mutation.isPending) setIntent(voucher); }} />)}</ul><AdminUserPagination page={query.data.page} totalPages={query.data.total_pages} disabled={query.isFetching || mutation.isPending} onPageChange={onPageChange} /></>}
    {query.isError && query.data ? <div role="alert" className="text-sm text-destructive">Chưa thể làm mới voucher.<ButtonRetry onClick={() => query.refetch()} /></div> : null}
    <ConfirmModal isOpen={intent !== null} title="Hoàn điểm voucher" message={`Bạn có muốn hoàn trả ${intent?.refundable_points?.toLocaleString("vi-VN") ?? ""} điểm cho voucher “${intent?.name ?? ""}”?`} cancelLabel="Hủy" confirmLabel="Hoàn điểm" isLoading={mutation.isPending} onCancel={() => { if (!submitting.current && !mutation.isPending) setIntent(null); }} onConfirm={confirmRefund} />
  </div>;
}

function ButtonRetry({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="mt-2 min-h-11 underline">Thử lại</button>; }
