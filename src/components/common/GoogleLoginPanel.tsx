"use client";
import { useState } from "react";
import type { AccountAuthResult } from "@/contracts/account";
import { GoogleAccountButton } from "@/src/components/common/GoogleAccountButton";
import LoginForm from "@/src/components/common/LoginForm";
import { useAccountSession } from "@/src/hooks/useAccountSession";
/** Keep Google primary while preserving existing password login and cart intent. */
export function GoogleLoginPanel({ onAuthenticated }: { onAuthenticated: (result: AccountAuthResult) => void }) {
  const [legacy, setLegacy] = useState(false);
  const adoptSession = useAccountSession();
  return <div className="space-y-5">
    <header className="space-y-2 text-center"><h2 className="text-2xl font-bold">Đăng nhập</h2><p className="text-sm text-muted-foreground">Đăng nhập bằng gmail để dễ dàng nhận nhiều thông báo khuyến mãi</p></header>
    <GoogleAccountButton purpose="LOGIN" onSuccess={(result) => { if ("reauth_proof" in result) return; adoptSession(result); onAuthenticated(result); }} />
    <button type="button" className="min-h-11 w-full rounded-xl text-sm text-primary focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={legacy} onClick={() => setLegacy((value) => !value)}>Đã có tài khoản SĐT / Instagram và mật khẩu</button>
    {legacy ? <LoginForm /> : null}
  </div>;
}
