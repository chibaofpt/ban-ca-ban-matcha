"use client";
import { useEffect, useState } from "react";
/** Track an ephemeral server deadline without trusting the browser wall-clock offset. */
export function useServerDeadline(value?: { expires_at: string; server_now: string } | null) {
  const expiresAt = value?.expires_at;
  const serverNow = value?.server_now;
  const [remaining, setRemaining] = useState(() => value ? Math.max(0, Math.ceil((Date.parse(value.expires_at) - Date.parse(value.server_now)) / 1000)) : 0);
  useEffect(() => {
    if (!expiresAt || !serverNow) return;
    const duration = Math.max(0, Date.parse(expiresAt) - Date.parse(serverNow));
    const started = performance.now();
    const tick = () => setRemaining(Math.max(0, Math.ceil((duration - (performance.now() - started)) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [expiresAt, serverNow]);
  return expiresAt && serverNow ? remaining : 0;
}
