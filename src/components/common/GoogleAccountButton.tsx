"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GoogleAuthPurpose, GoogleCredentialResult, GoogleChallengeResult } from "@/contracts/account";
import { createGoogleChallenge, submitGoogleCredential } from "@/src/services/accountService";
import { useGoogleIdentity } from "@/src/hooks/useGoogleIdentity";
import { useRegistrationTurnstile } from "@/src/hooks/useRegistrationTurnstile";
import { Button } from "@/src/components/ui/button";

interface Props {
  purpose: GoogleAuthPurpose;
  currentPassword?: string;
  disabled?: boolean;
  onSuccess: (result: GoogleCredentialResult) => void;
}
/** Prepare CAPTCHA and server nonce before showing the official Google sign-in button. */
export function GoogleAccountButton({ purpose, currentPassword, disabled, onSuccess }: Props) {
  const [prepared, setPrepared] = useState<{ value: GoogleChallengeResult; purpose: GoogleAuthPurpose; currentPassword?: string } | null>(null);
  const challenge = prepared?.purpose === purpose && prepared.currentPassword === currentPassword ? prepared.value : null;
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { containerRef: captchaRef, token: captchaToken, status: captchaStatus, reload: reloadCaptcha, reset: resetCaptcha } = useRegistrationTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "google_auth");
  const credential = useMutation({ mutationFn: submitGoogleCredential, retry: false,
    onSuccess: (result) => { if (active.current) onSuccess(result); },
    onError: (error) => { setMessage(error.message); setPrepared(null); resetCaptcha(); },
  });
  const prepare = useMutation({ mutationFn: createGoogleChallenge, retry: false,
    onSuccess: (value, input) => { if (active.current) setPrepared({ value, purpose: input.purpose, currentPassword: input.current_password }); resetCaptcha(); },
    onError: (error) => { setMessage(error.message); resetCaptcha(); },
  });
  const { containerRef: googleRef, error: googleError, configured: googleConfigured } = useGoogleIdentity(challenge?.nonce, (token) => {
    if (!challenge || disabled || credential.isPending) return;
    if (Date.parse(challenge.expires_at) <= Date.now()) { setPrepared(null); setMessage("Xác nhận đã hết hạn. Vui lòng bắt đầu lại."); return; }
    credential.mutate({ challenge_id: challenge.challenge_id, credential: token });
  });
  const busy = prepare.isPending || credential.isPending;
  if (!googleConfigured) return <p role="alert" className="rounded-xl bg-muted p-3 text-sm">Đăng nhập Google chưa được cấu hình. Vui lòng liên hệ cửa hàng hoặc sử dụng tài khoản SĐT / Instagram đã có.</p>;
  return <section className="space-y-3" aria-label="Đăng nhập bằng Google">
    <div ref={captchaRef} hidden={Boolean(challenge)} />
    {!challenge ? <>

      {captchaStatus === "error" ? <Button variant="outline" onClick={reloadCaptcha}>Tải lại xác nhận</Button> : null}
      <Button className="min-h-11 w-full" disabled={disabled || busy || !captchaToken || (purpose === "LINK" && !currentPassword)} onClick={() => { setMessage(null); prepare.mutate({ purpose, turnstile_token: captchaToken, ...(currentPassword ? { current_password: currentPassword } : {}) }); }}>Tiếp tục bằng Google</Button>
    </> : <div className={busy || disabled ? "pointer-events-none opacity-50" : ""} aria-busy={busy}><div ref={googleRef} className="min-h-11" /><Button variant="ghost" disabled={busy} onClick={() => setPrepared(null)}>Bắt đầu lại</Button></div>}
    {busy ? <p role="status" className="text-sm text-muted-foreground">Đang xác nhận tài khoản…</p> : null}
    {message || googleError ? <p role="alert" className="text-sm text-destructive">{message ?? googleError}</p> : null}
  </section>;
}
