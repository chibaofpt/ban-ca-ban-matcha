"use client";

import { Ban, Gift, KeyRound, ShieldCheck } from "lucide-react";
import type { AdminUserSummary } from "@/src/lib/types/adminUser";
import { Button } from "@/src/components/ui/button";

interface AdminUserActionsProps {
  user: AdminUserSummary;
  busy: boolean;
  onVerify: () => void;
  onBlockToggle: () => void;
  onResetPassword: () => void;
  onShowPoints: () => void;
  onShowVouchers: () => void;
}

/** Renders customer account actions with accessible touch targets. */
export function AdminUserActions(props: AdminUserActionsProps) {
  const { user, busy } = props;
  return <div className="space-y-2">
    <div className="grid grid-cols-4 gap-2">
      <Button disabled={busy} onClick={props.onShowPoints} className="h-auto min-h-11 flex-col gap-1 whitespace-normal bg-emerald-700 px-1 py-2 text-[11px] leading-tight text-white hover:bg-emerald-800 focus-visible:ring-emerald-700 sm:flex-row sm:text-sm"><Gift className="h-4 w-4 shrink-0" />Tặng điểm</Button>
      <Button disabled={busy} onClick={props.onShowVouchers} className="h-auto min-h-11 flex-col gap-1 whitespace-normal bg-emerald-700 px-1 py-2 text-[11px] leading-tight text-white hover:bg-emerald-800 focus-visible:ring-emerald-700 sm:flex-row sm:text-sm"><Gift className="h-4 w-4 shrink-0" />Tặng voucher</Button>
      <Button disabled={busy || !user.is_registered} aria-describedby={!user.is_registered ? "admin-reset-unavailable" : undefined} onClick={props.onResetPassword} className="h-auto min-h-11 flex-col gap-1 whitespace-normal bg-amber-200 px-1 py-2 text-[11px] leading-tight text-amber-950 hover:bg-amber-300 focus-visible:ring-amber-600 sm:flex-row sm:text-sm"><KeyRound className="h-4 w-4 shrink-0" />Reset mật khẩu</Button>
      <Button disabled={busy} variant={user.is_blocked ? "outline" : "destructive"} onClick={props.onBlockToggle} className="h-auto min-h-11 flex-col gap-1 whitespace-normal px-1 py-2 text-[11px] leading-tight sm:flex-row sm:text-sm"><Ban className="h-4 w-4 shrink-0" />{user.is_blocked ? "Mở tài khoản" : "Chặn user"}</Button>
    </div>
    {!user.is_registered ? <p id="admin-reset-unavailable" className="text-xs text-muted-foreground">Khách chưa đăng ký nên chưa thể reset mật khẩu.</p> : null}
    <button type="button" disabled={busy} onClick={props.onVerify} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{user.is_verified ? "Bỏ xác minh thủ công" : "Xác minh thủ công"}</button>
  </div>;
}
