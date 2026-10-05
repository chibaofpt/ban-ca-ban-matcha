"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string; action: string; callback: (token: string) => void;
    "expired-callback": () => void; "error-callback": () => boolean;
  }): string;
  remove(id: string): void;
  reset(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<TurnstileApi> | null = null;
function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) script.nonce = nonce;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("Verification unavailable")); }, 10000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else { script.remove(); reject(new Error("Verification unavailable")); }
    };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error("Verification unavailable")); };
    document.head.appendChild(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

/** Explicitly load and manage the third-party widget behind a browser adapter hook. */
export function useRegistrationTurnstile(siteKey?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "error">("loading");
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    void load().then((api) => {
      if (cancelled || !containerRef.current) return;
      setToken(""); setStatus("ready");
      widget.current = api.render(containerRef.current, {
        sitekey: siteKey, action: "registration_otp",
        callback: (value) => { if (!cancelled) { setToken(value); setStatus("verified"); } },
        "expired-callback": () => { if (!cancelled) { setToken(""); setStatus("ready"); } },
        "error-callback": () => { if (!cancelled) { setToken(""); setStatus("error"); } return true; },
      });
    }).catch(() => { if (!cancelled) { setToken(""); setStatus("error"); } });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, generation]);
  const reset = useCallback(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
    setToken(""); setStatus(widget.current ? "ready" : "error");
  }, []);
  const reload = useCallback(() => { setToken(""); setStatus("loading"); setGeneration((value) => value + 1); }, []);
  return { containerRef, token, status, reset, reload };
}
