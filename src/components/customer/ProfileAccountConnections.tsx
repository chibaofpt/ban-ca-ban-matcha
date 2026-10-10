"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CustomerProfile } from "@/contracts/profile";
import { Button } from "@/src/components/ui/button";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { GoogleAccountButton } from "@/src/components/common/GoogleAccountButton";
import { AccountPhoneForm } from "@/src/components/customer/AccountPhoneForm";
import { InitialAccountPassword } from "@/src/components/customer/InitialAccountPassword";
import { useAccountSession } from "@/src/hooks/useAccountSession";
/** Compose email, Google linkage, phone claim and server-gated first-password controls. */
export function ProfileAccountConnections({ profile, onRefresh }: { profile: CustomerProfile; onRefresh: () => Promise<unknown> }) {
  const [surface, setSurface] = useState<"google" | "phone" | "password" | null>(null);
  const [password, setPassword] = useState("");
  const adoptSession = useAccountSession();
  const router = useRouter();
  const finish = async () => { setSurface(null); setPassword(""); await onRefresh(); };
  return <section className="space-y-3 rounded-2xl border bg-card p-4">
    <label htmlFor="profile-account-email" className="block text-sm font-medium">Email</label>
    <input id="profile-account-email" readOnly value={profile.email ?? ""} placeholder="Chưa liên kết Google" className="min-h-11 w-full rounded-xl border bg-muted px-3 text-sm" />
    <p className="text-sm text-muted-foreground">{profile.google_connected ? "Đã liên kết Google" : "Chưa liên kết Google"}</p>
    <div className="grid gap-2">
      {!profile.google_connected ? <Button variant="outline" onClick={() => setSurface("google")}>Liên kết Google</Button> : null}
      <Button variant="outline" onClick={() => setSurface("phone")}>{profile.phone_number ? "Đổi số điện thoại" : "Thêm số điện thoại"}</Button>
      {profile.can_set_password ? <Button variant="outline" onClick={() => setSurface("password")}>Đặt mật khẩu đăng nhập</Button> : null}
    </div>
    <ResponsiveOverlay open={surface !== null} title={surface === "google" ? "Liên kết Google" : surface === "password" ? "Đặt mật khẩu" : "Số điện thoại"} description="Xác nhận quyền sở hữu tài khoản của bạn." onOpenChange={(open) => { if (!open) { setSurface(null); setPassword(""); } }}>
      {surface === "google" ? <div className="space-y-4">
        {profile.has_password ? <div className="space-y-1"><label htmlFor="google-link-password" className="text-sm">Mật khẩu hiện tại</label><input id="google-link-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 w-full rounded-xl border bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring" /></div> : null}
        <GoogleAccountButton purpose="LINK" currentPassword={password} onSuccess={(result) => { if ("reauth_proof" in result) return; adoptSession(result); void finish(); }} />
      </div> : surface === "phone" ? <AccountPhoneForm phone={profile.phone_number} onSaved={() => { toast.success("Đã lưu số điện thoại"); void finish(); }} onMerged={(result) => { adoptSession(result); setSurface(null); void onRefresh(); router.refresh(); toast.success("Đã nhận lịch sử và điểm của tài khoản"); }} /> : surface === "password" && profile.can_set_password ? <InitialAccountPassword onSaved={() => { toast.success("Đã đặt mật khẩu"); void finish(); }} /> : null}
    </ResponsiveOverlay>
  </section>;
}
