"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { CustomerProfile } from "@/contracts/profile";
import { Button } from "@/src/components/ui/button";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { InitialAccountPassword } from "@/src/components/customer/InitialAccountPassword";
/** Keep the server-gated first-password control at the bottom of the profile. */
export function ProfileAccountConnections({ profile, onRefresh }: { profile: CustomerProfile; onRefresh: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const finish = async () => { setOpen(false); await onRefresh(); };
  if (!profile.can_set_password) return null;
  return <section className="rounded-2xl border bg-card p-4">
    <Button variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>Đặt mật khẩu đăng nhập</Button>
    <ResponsiveOverlay open={open} title="Đặt mật khẩu" description="Xác nhận quyền sở hữu tài khoản của bạn." onOpenChange={setOpen}>
      <InitialAccountPassword onSaved={() => { toast.success("Đã đặt mật khẩu"); void finish(); }} />
    </ResponsiveOverlay>
  </section>;
}
