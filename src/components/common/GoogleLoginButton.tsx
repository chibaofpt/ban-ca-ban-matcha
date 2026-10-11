"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GoogleChallengeResult, GoogleCredentialResult } from "@/contracts/account";
import { createGoogleChallenge, submitGoogleCredential } from "@/src/services/accountService";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import { useGoogleIdentity } from "@/src/hooks/useGoogleIdentity";
import { useRegistrationTurnstile } from "@/src/hooks/useRegistrationTurnstile";
import { Button } from "@/src/components/ui/button";

interface Props {
  purpose?: "LOGIN" | "CLAIM";
  onSuccess: (result: GoogleCredentialResult) => void;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}

/** Load Google's official LOGIN/CLAIM button while CAPTCHA runs independently. */
export function GoogleLoginButton({ purpose = "LOGIN", onSuccess, disabled, onBusyChange }: Props) {
  const [generation, setGeneration] = useState(0);
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return <p role="alert" className="rounded-xl bg-muted p-3 text-sm">{purpose === "CLAIM" ? "Liên kết Google chưa được cấu hình. Vui lòng liên hệ nhân viên để được hỗ trợ." : "Đăng nhập Google chưa được cấu hình. Vui lòng sử dụng tài khoản SĐT / Instagram đã có."}</p>;
  return <PreparedGoogleLogin key={`${purpose}-${generation}`} purpose={purpose} onSuccess={onSuccess} disabled={disabled} onBusyChange={onBusyChange} onRestart={() => setGeneration(value => value + 1)} />;
}

function PreparedGoogleLogin({ purpose = "LOGIN", onSuccess, onRestart, disabled, onBusyChange }: Props & { onRestart: () => void }) {
  const [challenge, setChallenge] = useState<GoogleChallengeResult | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [assertion, setAssertion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [mustRestart, setMustRestart] = useState(false);
  const [expired, setExpired] = useState(false);
  const active = useRef(true);
  const exchanging = useRef(false);
  const preparation = useRef<Promise<GoogleChallengeResult> | null>(null);
  const { containerRef: captchaRef, token: captchaToken, status: captchaStatus, reset: resetCaptcha, reload: reloadCaptcha } =
    useRegistrationTurnstile(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "google_auth", "interaction-only");
  const { mutate, isPending } = useMutation({ mutationFn: submitGoogleCredential, retry: false,
    onSuccess: result => { if (active.current) onSuccess(result); },
    onError: error => {
      if (!active.current) return;
      exchanging.current = false;
      setMessage(error.message); setPaused(true);
      const reason = error instanceof ApiServiceError ? (error.details as { reason?: string } | undefined)?.reason : undefined;
      setMustRestart(typeof reason === "string" && !reason.startsWith("TURNSTILE_"));
      resetCaptcha();
    },
  });
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    preparation.current ??= createGoogleChallenge({ purpose });
    void preparation.current.then(value => {
      if (!cancelled) setChallenge(value);
    }).catch((error: unknown) => {
      if (!cancelled) setPrepareError(error instanceof Error ? error.message : "Không tải được Google. Vui lòng thử lại.");
    });
    return () => { cancelled = true; active.current = false; };
  }, [purpose]);
  useEffect(() => {
    onBusyChange(isPending);
    return () => onBusyChange(false);
  }, [isPending, onBusyChange]);
  useEffect(() => {
    if (!challenge) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(challenge.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [challenge]);
  const { containerRef: googleRef, error: googleError, ready } = useGoogleIdentity(expired ? undefined : challenge?.nonce, credential => {
    if (!challenge || assertion || isPending || disabled) return;
    if (Date.parse(challenge.expires_at) <= Date.now()) { setExpired(true); return; }
    setMessage(null); setAssertion(credential);
  });
  useEffect(() => {
    if (!challenge || !assertion || !captchaToken || paused || expired || disabled || exchanging.current) return;
    exchanging.current = true;
    mutate({ challenge_id: challenge.challenge_id, credential: assertion, turnstile_token: captchaToken });
  }, [challenge, assertion, captchaToken, paused, expired, disabled, mutate]);

  const captchaError = assertion && captchaStatus === "error" ? "Không thể xác minh bảo mật. Vui lòng thử lại." : null;
  const error = prepareError ?? googleError ?? message ?? (expired ? "Phiên đăng nhập đã hết hạn. Vui lòng thử lại." : captchaError);
  const waiting = Boolean(assertion && !paused && !expired && !captchaError);
  return <section className="space-y-3" aria-label="Đăng nhập bằng Google">
    <div className={assertion || expired || disabled ? "pointer-events-none opacity-50" : ""} inert={Boolean(assertion || expired || disabled)} aria-busy={!ready || isPending}>
      <div ref={googleRef} className="min-h-11" />
      {!ready && !error ? <p role="status" className="text-center text-sm text-muted-foreground">Đang tải Google…</p> : null}
    </div>
    <div ref={captchaRef} />
    {isPending || waiting ? <p role="status" className="text-sm text-muted-foreground">Đang xác nhận tài khoản…</p> : null}
    {error && !isPending ? <div className="space-y-2">
      <p role="alert" className="text-sm text-destructive">{error}</p>
      <Button variant="outline" className="w-full" disabled={disabled} onClick={() => {
        if (!assertion || expired || mustRestart || prepareError || googleError) { onRestart(); return; }
        setMessage(null); setPaused(false); reloadCaptcha();
      }}>Thử lại</Button>
    </div> : null}
  </section>;
}
