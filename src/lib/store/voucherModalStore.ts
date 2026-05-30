"use client";

import { create } from "zustand";

interface VoucherModalState {
  open: boolean;
  openModal: () => void;
  close: () => void;
}

/**
 * useVoucherModalStore — controls the visibility of the unified VoucherModal.
 * Pattern matches useAuthModalStore for consistency.
 */
export const useVoucherModalStore = create<VoucherModalState>()((set) => ({
  open: false,
  openModal: () => set({ open: true }),
  close: () => set({ open: false }),
}));
