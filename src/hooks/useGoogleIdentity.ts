"use client";

import { useEffect, useRef, useState } from "react";
interface GoogleIdentityApi {
  initialize(options: { client_id: string; nonce: string; ux_mode: "popup"; auto_select: false; callback: (response: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: { type: "standard"; theme: "outline"; size: "large"; text: "signin_with"; width: number }): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentityApi } } } }
let loading: Promise<GoogleIdentityApi> | null = null;
function loadGoogle(): Promise<GoogleIdentityApi> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleIdentityApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) script.nonce = nonce;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("Google chưa khả dụng. Vui lòng thử lại.")); }, 10000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else reject(new Error("Google chưa khả dụng. Vui lòng thử lại."));
    };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error("Không tải được Google. Kiểm tra kết nối và thử lại.")); };
    document.head.appendChild(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}
/** Lazily render the official Google popup button bound to the server nonce. */
export function useGoogleIdentity(nonce: string | undefined, onCredential: (credential: string) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { callbackRef.current = onCredential; }, [onCredential]);
  useEffect(() => {
    if (!nonce) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let active = true;
    const container = containerRef.current;
    void loadGoogle().then((api) => {
      if (!active || !container) return;
      api.initialize({ client_id: clientId, nonce, ux_mode: "popup", auto_select: false, callback: ({ credential }) => { if (active) callbackRef.current(credential); } });
      container.replaceChildren();
      api.renderButton(container, { type: "standard", theme: "outline", size: "large", text: "signin_with", width: Math.min(320, container.clientWidth || 280) });
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Google chưa khả dụng."); });
    return () => { active = false; container?.replaceChildren(); };
  }, [nonce]);
  return { containerRef, error, configured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) };
}
