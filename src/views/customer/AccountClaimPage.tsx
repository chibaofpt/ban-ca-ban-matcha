"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ClaimContextResult } from "@/contracts/account";
import { getClaimContext } from "@/src/services/accountService";
import { GoogleLoginButton } from "@/src/components/common/GoogleLoginButton";
import { WelcomeRewardOverlay } from "@/src/components/rewards/WelcomeRewardOverlay";
import { Button } from "@/src/components/ui/button";
import { useServerDeadline } from "@/src/hooks/useServerDeadline";
import { useAccountSession } from "@/src/hooks/useAccountSession";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { toLocalPhone } from "@/src/utils/phone";
import { toast } from "sonner";
/** Accept a private legacy claim with Google and continue its configured welcome reward. */
export default function AccountClaimPage() {
  const router = useRouter();
  const adoptSession = useAccountSession();
  const openVoucherModal = useVoucherModalStore(state => state.openModal);
  const [context, setContext] = useState<ClaimContextResult | null>(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const [embedded, setEmbedded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const initialized = useRef(false);
  const contextMutation = useMutation({ mutationFn: async () => {
    const url = window.location.href;
    const isEmbedded = /Zalo/i.test(navigator.userAgent);
    const token = window.location.hash.slice(1);
    // Keep the handoff proof only in memory; a cookie-only resume has no shareable link.
    setOriginalUrl(token ? url : "");
    setEmbedded(isEmbedded);
    return getClaimContext(token || undefined);
  }, retry: false, onSuccess: (result) => {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setContext(result);
  } });
  const remaining = useServerDeadline(context);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    contextMutation.mutate();
  }, [contextMutation]);
  const unavailable = !context || remaining <= 0;
  const finish = () => { setRewardOpen(false); router.replace("/profile"); router.refresh(); };
  return <main className="mx-auto max-w-md space-y-5 overflow-x-hidden px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
    <header className="space-y-2"><h1 className="text-2xl font-bold">Nhận tài khoản</h1><p className="text-sm text-muted-foreground">Liên kết Google để nhận tài khoản và đăng nhập ngay.</p></header>
    {context && !unavailable && !completed ? <section className="space-y-1 rounded-xl border p-4" aria-label="Tài khoản đang nhận">
      <p className="text-sm text-muted-foreground">Số điện thoại của tài khoản</p>
      <p className="text-lg font-semibold">{toLocalPhone(context.phone_number)}</p>
    </section> : null}
    {embedded && context && remaining > 0 && !completed ? <section className="space-y-3 rounded-xl border p-4">
      <p className="text-sm">Google có thể bị chặn trong trình duyệt Zalo.</p>
      {originalUrl ? <>
        <p className="text-sm">Sao chép link nhận tài khoản bên dưới rồi dán vào Chrome / Safari để đăng nhập Google. Link vẫn hết hạn theo thời gian ban đầu.</p>
        <Button variant="outline" className="w-full" disabled={busy} onClick={async () => {
          try { await navigator.clipboard.writeText(originalUrl); toast.success("Đã sao chép link"); }
          catch { toast.error("Không thể sao chép tự động. Hãy mở lại link gốc từ tin nhắn của shop trong Chrome / Safari."); }
        }}>Sao chép link nhận tài khoản</Button>
      </> : <p className="text-sm">Bạn đã tải lại trang nên link gốc không còn trong trang này. Hãy mở lại link gốc từ tin nhắn của shop trong Chrome / Safari; nếu link đã hết hạn, nhờ nhân viên tạo link mới.</p>}
    </section> : null}
    {contextMutation.isPending ? <p role="status">Đang kiểm tra link…</p> : null}
    {!completed && (contextMutation.isError || (context && remaining <= 0)) ? <section role="alert" className="rounded-xl bg-muted p-4"><p>Link không còn khả dụng hoặc đã hết hạn. Vui lòng nhờ nhân viên tạo link mới.</p></section> : null}
    {context && remaining > 0 && !completed ? <p className="text-sm text-muted-foreground">Link còn hiệu lực {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p> : null}
    {context && !embedded && !completed ? <GoogleLoginButton purpose="CLAIM" disabled={unavailable} onBusyChange={setBusy} onSuccess={result => {
      if ("reauth_proof" in result) return;
      adoptSession(result); setCompleted(true);
      const reward = result.welcome_reward;
      if (reward?.mode === "GACHA" && reward.status === "PENDING") { setRewardOpen(true); return; }
      toast.success(reward?.outcome_kind === "POINTS" ? `Đã nhận tài khoản và ${reward.points} điểm chào mừng!`
        : reward?.outcome_kind === "VOUCHER" ? "Đã nhận tài khoản. Voucher chào mừng đã có trong ví!" : "Đã nhận tài khoản và đăng nhập thành công");
      finish();
    }} /> : null}
    {completed ? <p role="status" className="text-sm">Đã liên kết Google và đăng nhập thành công.</p> : null}
    {rewardOpen ? <WelcomeRewardOverlay open onOpenChange={open => { if (!open) finish(); }} onViewVoucher={() => { finish(); openVoucherModal(); }} /> : null}
  </main>;
}
