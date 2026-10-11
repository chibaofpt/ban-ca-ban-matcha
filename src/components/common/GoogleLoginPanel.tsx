"use client";
import { useState } from "react";
import type { AccountAuthResult } from "@/contracts/account";
import { GoogleLoginButton } from "@/src/components/common/GoogleLoginButton";
import LoginForm from "@/src/components/common/LoginForm";
import { useAccountSession } from "@/src/hooks/useAccountSession";
/** Keep Google primary while preserving existing password login and cart intent. */
export function GoogleLoginPanel({ onAuthenticated }: { onAuthenticated: (result: AccountAuthResult) => void }) {
  const [googleBusy, setGoogleBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const adoptSession = useAccountSession();
  return <div className="space-y-5">
    <header className="space-y-2 text-center"><h2 className="text-2xl font-bold">Đăng nhập</h2><p className="text-sm text-muted-foreground">Đăng nhập bằng gmail để dễ dàng nhận nhiều thông báo khuyến mãi</p></header>
    <GoogleLoginButton disabled={passwordBusy} onBusyChange={setGoogleBusy} onSuccess={(result) => { if ("reauth_proof" in result) return; adoptSession(result); onAuthenticated(result); }} />
    <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>Hoặc</span><span className="h-px flex-1 bg-border" /></div>
    <LoginForm disabled={googleBusy} onBusyChange={setPasswordBusy} />
  </div>;
}
