"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { AdminUserVoucher } from "@/src/lib/types/adminUser";
import { adminUserKeys, fetchAdminUserVouchers } from "@/src/services/adminUserService";
import { AdminUserPagination } from "@/src/components/admin/AdminUserPagination";
import { cn } from "@/src/utils/cn";

interface AdminUserVouchersProps {
  userQrToken: string;
  page: number;
  onPageChange: (page: number) => void;
}
const statusText: Record<string, string> = { ACTIVE: "Chưa sử dụng", REDEEMED: "Đã sử dụng", EXPIRED: "Đã hết hạn", RESERVED: "Đang treo để order", REFUNDED: "Đã hoàn điểm" };
const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

function VoucherRow({ voucher }: { voucher: AdminUserVoucher }) {
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
  return <li className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
    <div className="min-w-0"><p className="break-words font-medium">{voucher.name}</p>{voucher.description ? <p className="break-words text-sm text-muted-foreground">{voucher.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{voucher.issued_via === "POINTS_EXCHANGE" ? "Đổi lúc" : "Nhận lúc"} {dateTime.format(new Date(voucher.created_at))}</p></div>
    <div className="shrink-0 text-right text-xs"><p className={cn("font-medium", statusClass)}>{statusText[voucher.status] ?? voucher.status}</p><p className={cn("mt-1", dayClass)}>{days}</p></div>
  </li>;
}

/** Displays a paginated customer voucher wallet with effective status labels. */
export function AdminUserVouchers({ userQrToken, page, onPageChange }: AdminUserVouchersProps) {
  const query = useQuery({ queryKey: adminUserKeys.vouchers(userQrToken, page), queryFn: () => fetchAdminUserVouchers(userQrToken, page) });
  if (query.isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" aria-label="Đang tải voucher" /></div>;
  if (query.isError) return <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"><p>Không thể tải voucher.</p><ButtonRetry onClick={() => query.refetch()} /></div>;
  if (!query.data?.items.length) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Khách chưa có voucher.</p>;
  return <div className="space-y-4"><ul className="space-y-3">{query.data.items.map((voucher) => <VoucherRow key={voucher.qr_token} voucher={voucher} />)}</ul><AdminUserPagination page={query.data.page} totalPages={query.data.total_pages} disabled={query.isFetching} onPageChange={onPageChange} /></div>;
}

function ButtonRetry({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="mt-2 min-h-11 underline">Thử lại</button>; }
