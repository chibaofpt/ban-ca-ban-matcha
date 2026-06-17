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
  /** Fake login — stores phone locally. Replace with real API call in Phase 1. */
  login: (phone: string, name?: string) => void;
  logout: () => void;
}

/**
 * useAuthStore — global auth state managed by Zustand.
 * Persisted to localStorage so a page-refresh keeps the session alive
 * until real httpOnly-cookie auth is wired up in Phase 1.
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

/** Convenience selector: true when a user is logged-in. */
export const useIsLoggedIn = () => useAuthStore((s) => s.user !== null);

/** Convenience selector: the current user or null. */
export const useCurrentUser = () => useAuthStore((s) => s.user);
