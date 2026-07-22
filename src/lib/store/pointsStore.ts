"use client";

import { create } from "zustand";

interface PointsState {
  points: number | null;
  /** @deprecated Dùng useCustomerPoints() (TanStack Query) thay thế */
  fetchPoints: () => Promise<void>;
  setPoints: (pts: number) => void;
}

export const usePointsStore = create<PointsState>()((set) => ({
  points: null,
  fetchPoints: async () => {
    console.warn("fetchPoints is deprecated. Please use useCustomerPoints() hook instead.");
  },
  setPoints: (pts) => set({ points: pts }),
}));
