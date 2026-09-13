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
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Button disabled={busy} onClick={props.onShowPoints} className="gap-2 px-2"><Gift className="h-4 w-4" />Tặng điểm</Button>
      <Button disabled={busy} onClick={props.onShowVouchers} className="gap-2 bg-primary px-2 text-primary-foreground"><Gift className="h-4 w-4" />Tặng voucher</Button>
      <Button disabled={busy} onClick={props.onResetPassword} className="gap-2 bg-accent px-2 text-accent-foreground hover:bg-accent/80"><KeyRound className="h-4 w-4" />Reset mật khẩu</Button>
      <Button disabled={busy} variant={user.is_blocked ? "outline" : "destructive"} onClick={props.onBlockToggle} className="gap-2 px-2"><Ban className="h-4 w-4" />{user.is_blocked ? "Mở tài khoản" : "Chặn user"}</Button>
    </div>
    <button type="button" disabled={busy} onClick={props.onVerify} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{user.is_verified ? "Bỏ xác minh thủ công" : "Xác minh thủ công"}</button>
  </div>;
}
