"use client";

import { create } from "zustand";

interface VoucherModalState {
  open: boolean;
  requestedUseNowVoucherToken: string | null;
  useNowRequestVersion: number;
  openModal: () => void;
  close: () => void;
  requestUseNowVoucher: (token: string) => void;
  claimUseNowVoucherRequest: (token: string, expectedVersion: number) => boolean;
}

/**
 * useVoucherModalStore — controls the visibility of the unified VoucherModal.
 * Pattern matches useAuthModalStore for consistency.
 */
export const useVoucherModalStore = create<VoucherModalState>()((set, get) => ({
  open: false,
  requestedUseNowVoucherToken: null,
  useNowRequestVersion: 0,
  openModal: () => set({ open: true }),
  close: () => set((state) => ({
    open: false,
    requestedUseNowVoucherToken: null,
    useNowRequestVersion: state.useNowRequestVersion + 1,
  })),
  requestUseNowVoucher: (token) => set((state) => ({
    open: true,
    requestedUseNowVoucherToken: token,
    useNowRequestVersion: state.useNowRequestVersion + 1,
  })),
  claimUseNowVoucherRequest: (token, expectedVersion) => {
    const state = get();
    if (state.requestedUseNowVoucherToken !== token || state.useNowRequestVersion !== expectedVersion) return false;
    set({ requestedUseNowVoucherToken: null });
    return true;
  },
}));
