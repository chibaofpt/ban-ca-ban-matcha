"use client";

import { create } from "zustand";

export type AuthModalMode = "login" | "register";
export type VoucherAcquireIntent = { type: 'voucher_acquire'; packageId: string };

interface AuthModalState {
  open: boolean;
  mode: AuthModalMode;
  pendingIntent: VoucherAcquireIntent | null;
  openLogin: () => void;
  openLoginWithIntent: (intent: VoucherAcquireIntent) => void;
  openRegister: () => void;
  close: () => void;
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
  switchTo: (mode) => set({ mode }),
  clearIntent: () => set({ pendingIntent: null }),
}));
