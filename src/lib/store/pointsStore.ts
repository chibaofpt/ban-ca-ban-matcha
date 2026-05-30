"use client";

import { create } from "zustand";
import { apiClient } from "@/src/lib/api/client";

interface PointsState {
  points: number | null;
  fetchPoints: () => Promise<void>;
  setPoints: (pts: number) => void;
}

export const usePointsStore = create<PointsState>()((set) => ({
  points: null,
  fetchPoints: async () => {
    try {
      const res = await apiClient.get<{ data: { points_balance: number } }>("/api/profile/points");
      set({ points: res.data.data.points_balance });
    } catch (e) {
      // Ignore errors (user might not be logged in)
    }
  },
  setPoints: (pts) => set({ points: pts }),
}));
