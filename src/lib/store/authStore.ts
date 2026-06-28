"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resetForceLogout } from "@/src/lib/api/client";

/** Shape of the logged-in user stored in the auth store. */
export interface AuthUser {
  phone: string;
  name: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (phone: string, name?: string) => void;
  logout: () => void;
}

/**
 * useAuthStore — global auth state managed by Zustand.
 * Persisted to localStorage as `bcbm-auth`.
 * The httpOnly cookies are the real auth credentials — this store is UI state only.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,

      login: (phone, name) => {
        resetForceLogout();
        set({ user: { phone, name: name ?? phone } });
      },

      logout: () => set({ user: null }),
    }),
    { name: "bcbm-auth" }
  )
);

/** Fast login check from localStorage — use for UI display only (button labels, etc.). */
export const useIsLoggedIn = () => useAuthStore((s) => s.user !== null);

/** Convenience selector: the current user or null. */
export const useCurrentUser = () => useAuthStore((s) => s.user);

/**
 * Sync-safe login check: Zustand state AND has_session cookie must both be truthy.
 *
 * Problem it solves: when httpOnly auth cookies expire, Zustand localStorage still
 * says the user is logged in (user !== null). If we only check Zustand, we'd fire
 * auth-required API calls (points, vouchers) that result in a 401 cascade.
 *
 * has_session is a non-httpOnly cookie set by the server alongside the auth cookies.
 * It expires at the same time as the refresh_token (7 days), so it accurately
 * reflects whether a session is alive without exposing credentials to JS.
 *
 * Use this selector for `enabled` guards on auth-required React Query hooks.
 * Continue using useIsLoggedIn() for pure UI display (it reads from memory, no cookie parse).
 */
export const useIsLoggedInSynced = () =>
  useAuthStore((s) => {
    if (s.user === null) return false;
    if (typeof document === "undefined") return true; // SSR — trust Zustand
    return document.cookie.includes("has_session=1");
  });
