"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { onForceLogout } from "@/src/lib/api/client";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";


/**
 * AuthGuardProvider — Client-side wrapper that:
 *  1. Listens for force-logout events fired by the Axios interceptor when
 *     the refresh token is also dead.
 *  2. Detects `?auth=login` query param (set by server layouts / middleware
 *     when redirecting unauthenticated users) and auto-opens the login modal.
 *
 * Mount this once in the root layout so it covers all routes.
 * Behaviour on force-logout (all roles — CUSTOMER, STAFF, ADMIN):
 *   - Clears authStore (localStorage)
 *   - Shows a toast notification
 *   - Redirects to / and opens the unified login modal
 */
export default function AuthGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const openLogin = useAuthModalStore((s) => s.openLogin);

  // Keep a ref so the force-logout callback always reads the latest user value.
  // Without this, the closure registered in useEffect captures a stale user
  // snapshot and may incorrectly bail out when user has already been set to null.
  const userRef = useRef(user);
  userRef.current = user;

  // ── Auto-open login modal on ?auth=login ────────────────────────────────────
  // Server layouts and middleware set this param when redirecting unauthenticated
  // users to /. We open the modal and clean the URL so refresh doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "login" && !userRef.current) {
      openLogin();
      window.history.replaceState({}, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Force-logout listener ───────────────────────────────────────────────────
  // Register once (empty deps) — the callback always reads fresh values via refs.
  // Re-registering on every pathname/user change was unnecessary and could cause
  // the listener to briefly de-register between render and re-registration.
  useEffect(() => {
    onForceLogout(() => {
      // Only act when the client state indicates a user was logged in.
      if (!userRef.current) return;

      // 1. Clear client-side auth state (localStorage)
      logout();

      // 2. Inform user why they were logged out
      toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");

      // 3. All roles → go home and open the shared login modal
      router.replace("/");
      setTimeout(() => openLogin(), 300);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
