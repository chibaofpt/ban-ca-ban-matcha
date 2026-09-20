"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Loader2, Receipt, Search, Ticket } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { AdminUserActions } from "@/src/components/admin/AdminUserActions";
import { AdminUserOrderDetail } from "@/src/components/admin/AdminUserOrderDetail";
import { AdminUserOrders } from "@/src/components/admin/AdminUserOrders";
import { AdminUserPagination } from "@/src/components/admin/AdminUserPagination";
import { AdminUserPointsGift } from "@/src/components/admin/AdminUserPointsGift";
import { AdminUserSummary } from "@/src/components/admin/AdminUserSummary";
import { AdminUserVoucherGift } from "@/src/components/admin/AdminUserVoucherGift";
import { AdminUserVouchers } from "@/src/components/admin/AdminUserVouchers";
import { Button } from "@/src/components/ui/button";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { OverlayStackProvider } from "@/src/components/ui/OverlayStackProvider";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import type { AdminUserPatch, AdminUserSummary as AdminUserSummaryDto } from "@/src/lib/types/adminUser";
import { ApiServiceError } from "@/src/services/orderService";
import {
  adminUserKeys, fetchAdminUser, fetchAdminUserOrder, fetchAdminUsers,
  giftAdminUserPoints, updateAdminUser,
} from "@/src/services/adminUserService";

type AccountIntent = { action: AdminUserPatch; title: string; message: string; confirmLabel: string; destructive?: boolean };
type DetailTab = "orders" | "vouchers";
type DetailView =
  | { kind: "customer" }
  | { kind: "gift-points" }
  | { kind: "gift-voucher" }
  | { kind: "order"; orderId: string };

function errorText(error: unknown): string {
  return error instanceof ApiServiceError || error instanceof Error ? error.message : "Thao tác thất bại";
}

function DetailBackButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <Button type="button" variant="ghost" disabled={disabled} onClick={onClick} className="min-h-11 gap-2 px-2 focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" />Quay lại khách hàng</Button>;
}

/** Composes the searchable admin customer list and managed detail surfaces. */
export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUserSummaryDto | null>(null);
  const [detailView, setDetailView] = useState<DetailView>({ kind: "customer" });
  const [activeTab, setActiveTab] = useState<DetailTab>("orders");
  const [ordersPage, setOrdersPage] = useState(1);
  const [vouchersPage, setVouchersPage] = useState(1);
  const ordersTabRef = useRef<HTMLButtonElement>(null);
  const vouchersTabRef = useRef<HTMLButtonElement>(null);
  const [intent, setIntent] = useState<AccountIntent | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const listQuery = useQuery({ queryKey: adminUserKeys.list(page, query), queryFn: () => fetchAdminUsers(page, query) });
  const detailQuery = useQuery({
    queryKey: adminUserKeys.detail(selected?.qr_token ?? ""),
    queryFn: () => fetchAdminUser(selected!.qr_token),
    enabled: Boolean(selected),
  });
  const selectedOrderId = detailView.kind === "order" ? detailView.orderId : null;
  const orderQuery = useQuery({
    queryKey: adminUserKeys.order(selected?.qr_token ?? "", selectedOrderId ?? ""),
    queryFn: () => fetchAdminUserOrder(selected!.qr_token, selectedOrderId!),
    enabled: Boolean(selected && selectedOrderId),
  });
  const refreshCustomer = async () => {
    await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
  };
  const accountMutation = useMutation({
    mutationFn: ({ token, action }: { token: string; action: AdminUserPatch }) => updateAdminUser(token, action),
    onError: (error) => toast.error(errorText(error)),
  });
  const pointsMutation = useMutation({
    mutationFn: ({ token, points }: { token: string; points: number }) => giftAdminUserPoints(token, points),
    onSuccess: async () => { await refreshCustomer(); setDetailView({ kind: "customer" }); toast.success("Đã tặng điểm"); },
    onError: (error) => toast.error(errorText(error)),
  });
  const user = detailQuery.data ?? selected;
  const busy = accountMutation.isPending || pointsMutation.isPending || voucherBusy;
  const sheetTitle = detailView.kind === "gift-points" ? "Tặng điểm"
    : detailView.kind === "gift-voucher" ? "Tặng voucher"
      : detailView.kind === "order" ? orderQuery.data?.code ?? "Chi tiết đơn hàng"
        : user?.name ?? "Chi tiết khách hàng";
  const sheetDescription = detailView.kind === "order"
    ? "Các giá trị đã lưu tại thời điểm đặt đơn."
    : user ? `${user.phone_number} · ${user.current_voucher_count} voucher hiện có` : "Đang tải thông tin khách hàng";

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(input.trim());
  }
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: DetailTab) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab = currentTab === "orders" ? "vouchers" : "orders";
    setActiveTab(nextTab);
    (nextTab === "orders" ? ordersTabRef : vouchersTabRef).current?.focus();
  }
  function closeCustomer() {
    if (busy) return;
    setSelected(null);
    setDetailView({ kind: "customer" });
    setActiveTab("orders");
    setOrdersPage(1);
    setVouchersPage(1);
    setIntent(null);
    setTemporaryPassword(null);
  }
  function accountIntent(action: AdminUserPatch): AccountIntent {
    if (action.action === "reset_password") return { action, title: "Reset mật khẩu", message: "Tạo mật khẩu tạm thời mới cho khách hàng này?", confirmLabel: "Reset mật khẩu" };
    if (action.action === "block") return { action, title: action.is_blocked ? "Chặn tài khoản" : "Mở tài khoản", message: action.is_blocked ? "Khách sẽ không thể đăng nhập cho đến khi được mở lại." : "Khách sẽ có thể đăng nhập lại.", confirmLabel: action.is_blocked ? "Chặn tài khoản" : "Mở tài khoản", destructive: action.is_blocked };
    return { action, title: action.is_verified ? "Xác minh khách hàng" : "Bỏ xác minh", message: "Cập nhật trạng thái xác minh thủ công cho khách hàng này?", confirmLabel: "Cập nhật" };
  }
  async function confirmAccountAction() {
    if (!selected || !intent) return;
    const activeIntent = intent;
    try {
      const result = await accountMutation.mutateAsync({ token: selected.qr_token, action: activeIntent.action });
      if (activeIntent.action.action === "reset_password" && "temporary_password" in result) {
        setTemporaryPassword(result.temporary_password);
        setIntent(null);
        void refreshCustomer().catch(() => toast.error("Đã reset mật khẩu nhưng chưa thể làm mới thông tin khách hàng."));
        return;
      }
      setIntent(null);
      await refreshCustomer();
      toast.success("Đã cập nhật khách hàng");
    } catch { /* Mutation feedback is handled by onError. */ }
  }

  return <OverlayStackProvider><main className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden px-3 py-6 pb-28 md:px-8">
    <header><p className="text-sm font-semibold text-primary">Khách hàng</p><h1 className="text-2xl font-bold">Quản lý khách hàng</h1><p className="mt-1 text-sm text-muted-foreground">Tìm theo tên, số điện thoại hoặc Instagram.</p></header>
    <form onSubmit={submitSearch} className="space-y-2 rounded-2xl border bg-card p-4">
      <label htmlFor="admin-user-search" className="block text-sm font-medium">Tìm khách hàng</label>
      <div className="flex gap-2"><div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input id="admin-user-search" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tên, số điện thoại, @instagram" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><Button type="submit" disabled={listQuery.isFetching}>Tìm</Button></div>
    </form>
    {listQuery.isPending ? <p role="status" className="flex justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="animate-spin" />Đang tải khách hàng…</p> : listQuery.isError ? <div className="space-y-3 rounded-2xl bg-destructive/10 p-5 text-destructive"><p role="alert">Không tải được danh sách khách hàng.</p><Button variant="outline" onClick={() => void listQuery.refetch()}>Thử lại</Button></div> : listQuery.data.items.length === 0 ? <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Không tìm thấy khách hàng phù hợp.</p> : <section className="space-y-3" aria-label="Danh sách khách hàng">{listQuery.data.items.map((item) => <AdminUserSummary key={item.qr_token} user={item} interactive onClick={() => setSelected(item)} />)}<AdminUserPagination page={listQuery.data.page} totalPages={listQuery.data.total_pages} disabled={listQuery.isFetching} onPageChange={setPage} /></section>}

    <ResponsiveOverlay open={Boolean(selected)} title={sheetTitle} description={sheetDescription} size="lg" dismissPolicy="locked-while-busy" busy={busy} onOpenChange={(open) => { if (!open) closeCustomer(); }}>
      {detailQuery.isPending || !user ? <p role="status" className="flex justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="animate-spin" />Đang tải chi tiết…</p> : detailQuery.isError ? <div className="space-y-3"><p role="alert" className="text-destructive">Không tải được chi tiết khách hàng.</p><Button variant="outline" onClick={() => void detailQuery.refetch()}>Thử lại</Button></div> : detailView.kind === "customer" ? <div className="space-y-6">
        <section className="rounded-2xl border bg-card p-4"><AdminUserSummary user={user} /></section>
        <AdminUserActions user={user} busy={busy} onShowPoints={() => setDetailView({ kind: "gift-points" })} onShowVouchers={() => setDetailView({ kind: "gift-voucher" })} onResetPassword={() => setIntent(accountIntent({ action: "reset_password" }))} onBlockToggle={() => setIntent(accountIntent({ action: "block", is_blocked: !user.is_blocked }))} onVerify={() => setIntent(accountIntent({ action: "verify", is_verified: !user.is_verified }))} />
        <div className="grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Thông tin khách hàng">
          <button ref={ordersTabRef} id="admin-user-orders-tab" type="button" role="tab" tabIndex={activeTab === "orders" ? 0 : -1} aria-selected={activeTab === "orders"} aria-controls="admin-user-orders-panel" onKeyDown={(event) => handleTabKeyDown(event, "orders")} onClick={() => setActiveTab("orders")} className={activeTab === "orders" ? "flex min-h-11 items-center justify-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}><Receipt className="h-4 w-4" />Orders</button>
          <button ref={vouchersTabRef} id="admin-user-vouchers-tab" type="button" role="tab" tabIndex={activeTab === "vouchers" ? 0 : -1} aria-selected={activeTab === "vouchers"} aria-controls="admin-user-vouchers-panel" onKeyDown={(event) => handleTabKeyDown(event, "vouchers")} onClick={() => setActiveTab("vouchers")} className={activeTab === "vouchers" ? "flex min-h-11 items-center justify-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}><Ticket className="h-4 w-4" />Vouchers</button>
        </div>
        <section id="admin-user-orders-panel" role="tabpanel" aria-labelledby="admin-user-orders-tab" hidden={activeTab !== "orders"}>{activeTab === "orders" ? <AdminUserOrders userQrToken={user.qr_token} page={ordersPage} onPageChange={setOrdersPage} onSelectOrder={(orderId) => setDetailView({ kind: "order", orderId })} /> : null}</section>
        <section id="admin-user-vouchers-panel" role="tabpanel" aria-labelledby="admin-user-vouchers-tab" hidden={activeTab !== "vouchers"}>{activeTab === "vouchers" ? <AdminUserVouchers userQrToken={user.qr_token} page={vouchersPage} onPageChange={setVouchersPage} /> : null}</section>
      </div> : detailView.kind === "gift-points" ? <div className="space-y-4">
        <DetailBackButton onClick={() => setDetailView({ kind: "customer" })} />
        <AdminUserPointsGift currentBalance={user.points_balance} pending={pointsMutation.isPending} onSubmit={async (points) => { try { await pointsMutation.mutateAsync({ token: user.qr_token, points }); } catch { /* Mutation feedback is handled by onError. */ } }} />
      </div> : detailView.kind === "gift-voucher" ? <div className="space-y-4">
        <DetailBackButton disabled={voucherBusy} onClick={() => { if (voucherBusy) return; setDetailView({ kind: "customer" }); }} />
        <AdminUserVoucherGift userQrToken={user.qr_token} onBusyChange={setVoucherBusy} onGifted={async () => { await refreshCustomer(); setVoucherBusy(false); setDetailView({ kind: "customer" }); }} />
      </div> : <div className="space-y-4">
        <DetailBackButton onClick={() => setDetailView({ kind: "customer" })} />
        {orderQuery.isPending ? <p role="status" className="flex gap-2 text-muted-foreground"><Loader2 className="animate-spin" />Đang tải đơn hàng…</p> : orderQuery.isError ? <div className="space-y-3"><p role="alert" className="text-destructive">Không tải được đơn hàng.</p><Button variant="outline" onClick={() => void orderQuery.refetch()}>Thử lại</Button></div> : orderQuery.data ? <AdminUserOrderDetail order={orderQuery.data} /> : null}
      </div>}
    </ResponsiveOverlay>

    <ConfirmModal isOpen={intent !== null} title={intent?.title ?? "Xác nhận"} message={intent?.message ?? ""} confirmLabel={intent?.confirmLabel} isDestructive={intent?.destructive} isLoading={accountMutation.isPending} onCancel={() => setIntent(null)} onConfirm={() => void confirmAccountAction()} />
    <ResponsiveOverlay open={temporaryPassword !== null} title="Mật khẩu tạm thời" description="Sao chép và gửi trực tiếp cho khách. Mật khẩu sẽ biến mất khi đóng." size="sm" layer="critical" dismissPolicy="explicit-only" onOpenChange={(open) => { if (!open) setTemporaryPassword(null); }}>
      {temporaryPassword ? <div className="space-y-4"><label htmlFor="temporary-password" className="block text-sm font-medium">Mật khẩu mới</label><input id="temporary-password" readOnly value={temporaryPassword} onClick={(event) => event.currentTarget.select()} className="min-h-11 w-full rounded-xl border bg-muted px-3 font-mono text-lg" /><Button className="w-full gap-2" onClick={() => void navigator.clipboard.writeText(temporaryPassword).then(() => toast.success("Đã sao chép mật khẩu"), () => toast.error("Không thể sao chép tự động"))}><Copy className="h-4 w-4" />Sao chép mật khẩu</Button></div> : null}
    </ResponsiveOverlay>
  </main></OverlayStackProvider>;
}
