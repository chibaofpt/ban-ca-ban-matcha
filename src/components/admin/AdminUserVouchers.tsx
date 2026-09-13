"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { AdminUserVoucher } from "@/src/lib/types/adminUser";
import { adminUserKeys, fetchAdminUserVouchers } from "@/src/services/adminUserService";
import { AdminUserPagination } from "@/src/components/admin/AdminUserPagination";
import { cn } from "@/src/utils/cn";

interface AdminUserVouchersProps { userQrToken: string }
const statusText: Record<string, string> = { ACTIVE: "Chưa sử dụng", REDEEMED: "Đã sử dụng", EXPIRED: "Đã hết hạn", RESERVED: "Đang treo để order", REFUNDED: "Đã hoàn điểm" };
const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

function VoucherRow({ voucher }: { voucher: AdminUserVoucher }) {
  const effective = voucher.status === "ACTIVE" && voucher.days_remaining !== null && voucher.days_remaining < 0 ? "EXPIRED" : voucher.status;
  const dayClass = voucher.days_remaining === null ? "" : voucher.days_remaining < 5 ? "text-destructive" : voucher.days_remaining < 15 ? "text-accent-foreground" : "text-primary";
  const days = voucher.days_remaining === null ? "Không hết hạn" : voucher.days_remaining < 0 ? `Đã hết hạn ${Math.abs(voucher.days_remaining)} ngày` : voucher.days_remaining === 0 ? "Hết hạn hôm nay" : `Còn ${voucher.days_remaining} ngày`;
  return <li className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-0">
    <div className="min-w-0"><p className="font-medium">{voucher.name}</p>{voucher.description ? <p className="text-sm text-muted-foreground">{voucher.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{voucher.issued_via === "POINTS_EXCHANGE" ? "Đổi lúc" : "Nhận lúc"} {dateTime.format(new Date(voucher.created_at))}</p></div>
    <div className="shrink-0 text-right text-xs"><p className={cn(effective === "ACTIVE" ? "text-primary" : effective === "RESERVED" ? "text-accent-foreground" : "text-destructive")}>{statusText[effective] ?? effective}</p><p className={cn("mt-1", dayClass)}>{days}</p></div>
  </li>;
}

/** Displays a paginated customer voucher wallet with effective status labels. */
export function AdminUserVouchers({ userQrToken }: AdminUserVouchersProps) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: adminUserKeys.vouchers(userQrToken, page), queryFn: () => fetchAdminUserVouchers(userQrToken, page) });
  if (query.isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" aria-label="Đang tải voucher" /></div>;
  if (query.isError) return <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"><p>Không thể tải voucher.</p><ButtonRetry onClick={() => query.refetch()} /></div>;
  if (!query.data?.items.length) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Khách chưa có voucher.</p>;
  return <div className="space-y-4"><ul>{query.data.items.map((voucher) => <VoucherRow key={voucher.qr_token} voucher={voucher} />)}</ul><AdminUserPagination page={query.data.page} totalPages={query.data.total_pages} disabled={query.isFetching} onPageChange={setPage} /></div>;
}

function ButtonRetry({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="mt-2 min-h-11 underline">Thử lại</button>; }
