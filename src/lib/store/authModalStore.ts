"use client";

import { create } from "zustand";

export type AuthModalMode = "login" | "register";
export type VoucherAcquireIntent = { type: 'voucher_acquire'; packageId: string };
export type AuthModalIntent =
  | VoucherAcquireIntent
  | { type: "open_voucher_wallet" }
  | { type: "open_cart_vouchers" };

interface AuthModalState {
  open: boolean;
  mode: AuthModalMode;
  pendingIntent: AuthModalIntent | null;
  openLogin: () => void;
  openLoginWithIntent: (intent: AuthModalIntent) => void;
  openRegister: () => void;
  /** Close after successful authentication while preserving the pending intent. */
  close: () => void;
  /** Dismiss authentication and abandon the pending intent. */
  dismiss: () => void;
  switchTo: (mode: AuthModalMode) => void;
  clearIntent: () => void;
}

/**
 * useAuthModalStore — controls the visibility and mode of the auth modal.
 * Kept separate from authStore so UI state is never mixed with user data.
 */
export const useAuthModalStore = create<AuthModalState>()((set) => ({
  open: false,
  mode: "login",
  pendingIntent: null,

  openLogin: () => set({ open: true, mode: "login", pendingIntent: null }),
  openLoginWithIntent: (intent) => set({ open: true, mode: "login", pendingIntent: intent }),
  openRegister: () => set({ open: true, mode: "register", pendingIntent: null }),
  close: () => set({ open: false }),
  dismiss: () => set({ open: false, pendingIntent: null }),
  switchTo: (mode) => set({ mode }),
  clearIntent: () => set({ pendingIntent: null }),
}));
