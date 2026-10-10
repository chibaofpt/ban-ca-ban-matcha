"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ClaimContextResult } from "@/contracts/account";
import { getClaimContext, claimAccountPassword } from "@/src/services/accountService";
import { GoogleAccountButton } from "@/src/components/common/GoogleAccountButton";
import { Button } from "@/src/components/ui/button";
import { useRegistrationTurnstile } from "@/src/hooks/useRegistrationTurnstile";
import { useServerDeadline } from "@/src/hooks/useServerDeadline";
import { useAccountSession } from "@/src/hooks/useAccountSession";
import { toast } from "sonner";
const schema = z.object({
  password: z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự").refine((value) => new TextEncoder().encode(value).length <= 72, "Mật khẩu tối đa 72 byte UTF-8"),
  password_confirmation: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
}).refine((value) => value.password === value.password_confirmation, { path: ["password_confirmation"], message: "Mật khẩu xác nhận không khớp" });
type Values = z.infer<typeof schema>;
/** Resolve the private claim fragment once and offer Google or password ownership proof. */
export default function AccountClaimPage() {
  const router = useRouter();
  const adoptSession = useAccountSession();
  const [context, setContext] = useState<ClaimContextResult | null>(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const [embedded, setEmbedded] = useState(false);
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
  const passwordMutation = useMutation({ mutationFn: claimAccountPassword, retry: false, onSuccess: (result) => { adoptSession(result); toast.success("Đã nhận tài khoản"); router.replace("/profile"); router.refresh(); } });
  const remaining = useServerDeadline(context);
  const { containerRef: captchaRef, token: captchaToken, status: captchaStatus, reload: reloadCaptcha, reset: resetCaptcha } = useRegistrationTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "account_claim");
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onBlur", defaultValues: { password: "", password_confirmation: "" } });
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    contextMutation.mutate();
  }, [contextMutation]);
  const unavailable = !context || remaining <= 0;
  const submit = form.handleSubmit(async (values) => {
    if (unavailable || !captchaToken) return;
    try { await passwordMutation.mutateAsync({ ...values, turnstile_token: captchaToken }); }
    catch { resetCaptcha(); }
  });
  return <main className="mx-auto max-w-md space-y-5 overflow-x-hidden px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
    <header className="space-y-2"><h1 className="text-2xl font-bold">Nhận tài khoản</h1><p className="text-sm text-muted-foreground">Đăng nhập bằng gmail để dễ dàng nhận nhiều thông báo khuyến mãi</p></header>
    {embedded && context && remaining > 0 ? <section className="space-y-3 rounded-xl border p-4">
      <p className="text-sm">Google có thể bị chặn trong trình duyệt Zalo.</p>
      {originalUrl ? <>
        <p className="text-sm">Sao chép link nhận tài khoản bên dưới rồi dán vào Chrome / Safari để đăng nhập Google. Link vẫn hết hạn theo thời gian ban đầu.</p>
        <Button variant="outline" className="w-full" onClick={async () => {
          try { await navigator.clipboard.writeText(originalUrl); toast.success("Đã sao chép link"); }
          catch { toast.error("Không thể sao chép tự động. Hãy mở lại link gốc từ tin nhắn của shop trong Chrome / Safari."); }
        }}>Sao chép link nhận tài khoản</Button>
      </> : <p className="text-sm">Bạn đã tải lại trang nên link gốc không còn trong trang này. Hãy mở lại link gốc từ tin nhắn của shop trong Chrome / Safari; nếu link đã hết hạn, nhờ nhân viên tạo link mới. Bạn vẫn có thể nhận tài khoản bằng mật khẩu bên dưới khi phiên này còn hiệu lực.</p>}
    </section> : null}
    {contextMutation.isPending ? <p role="status">Đang kiểm tra link…</p> : null}
    {contextMutation.isError || (context && remaining <= 0) ? <section role="alert" className="rounded-xl bg-muted p-4"><p>Link không còn khả dụng hoặc đã hết hạn. Vui lòng nhờ nhân viên tạo link mới.</p></section> : null}
    {context && remaining > 0 ? <p className="text-sm text-muted-foreground">Link còn hiệu lực {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p> : null}
    <div ref={captchaRef} hidden={!context} />
    {context ? <>
      {!embedded ? <GoogleAccountButton purpose="CLAIM" disabled={unavailable || passwordMutation.isPending} onSuccess={(result) => { if ("reauth_proof" in result) return; adoptSession(result); router.replace("/profile"); router.refresh(); }} /> : null}
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm font-medium">Hoặc nhận tài khoản bằng mật khẩu</p>
        {(["password", "password_confirmation"] as const).map((field) => <div key={field} className="space-y-1"><label htmlFor={field} className="text-sm">{field === "password" ? "Mật khẩu mới" : "Xác nhận mật khẩu"}</label><input id={field} type="password" autoComplete="new-password" disabled={unavailable || passwordMutation.isPending} {...form.register(field)} className="min-h-11 w-full rounded-xl border bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring" />{form.formState.errors[field] ? <p role="alert" className="text-xs text-destructive">{form.formState.errors[field]?.message}</p> : null}</div>)}

        {captchaStatus === "error" ? <Button variant="outline" type="button" onClick={reloadCaptcha}>Tải lại xác nhận</Button> : null}
        {passwordMutation.isError ? <p role="alert" className="text-sm text-destructive">{passwordMutation.error.message}</p> : null}
        <Button type="submit" className="min-h-11 w-full" disabled={unavailable || passwordMutation.isPending || !captchaToken}>{passwordMutation.isPending ? "Đang nhận tài khoản…" : "Nhận tài khoản"}</Button>
      </form>
    </> : null}
  </main>;
}
