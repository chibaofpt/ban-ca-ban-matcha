"use client";

import { ShieldCheck } from "lucide-react";
import type { AdminUserSummary } from "@/src/lib/types/adminUser";
import { Button } from "@/src/components/ui/button";

interface AdminUserActionsProps {
  user: AdminUserSummary;
  busy: boolean;
  onVerify: () => void;
  onClaimLink: () => void;
  onBlockToggle: () => void;
  onResetPassword: () => void;
  onShowPoints: () => void;
  onShowVouchers: () => void;
}

/** Renders customer account actions with accessible touch targets. */
export function AdminUserActions(props: AdminUserActionsProps) {
  const { user, busy } = props;
  const actionClassName = "min-h-11 grow basis-auto whitespace-nowrap px-0.5 text-[clamp(0.625rem,2.7vw,0.875rem)] sm:px-2";
  return <div className="space-y-2">
    {user.can_send_claim_link ? <Button className="w-full min-h-11" disabled={busy} onClick={props.onClaimLink}>Gửi link nhận tài khoản</Button> : null}
    <div className="flex w-full flex-nowrap gap-2">
      <Button disabled={busy} onClick={props.onShowPoints} className={actionClassName}>Tặng điểm</Button>
      <Button disabled={busy} onClick={props.onShowVouchers} className={actionClassName}>Tặng voucher</Button>
      <Button disabled={busy || !user.has_password} aria-describedby={!user.has_password ? "admin-reset-unavailable" : undefined} onClick={props.onResetPassword} className={`${actionClassName} bg-amber-200 text-amber-950 hover:bg-amber-300 focus-visible:ring-amber-600`}>Reset mật khẩu</Button>
      <Button disabled={busy} variant={user.is_blocked ? "outline" : "destructive"} onClick={props.onBlockToggle} className={actionClassName}>{user.is_blocked ? "Mở tài khoản" : "Chặn user"}</Button>
    </div>
    {!user.has_password ? <p id="admin-reset-unavailable" className="text-xs text-muted-foreground">Tài khoản chưa có mật khẩu nên chưa thể reset mật khẩu.</p> : null}
    <button type="button" disabled={busy} onClick={props.onVerify} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{user.is_verified ? "Bỏ xác minh thủ công" : "Xác minh thủ công"}</button>
  </div>;
}
