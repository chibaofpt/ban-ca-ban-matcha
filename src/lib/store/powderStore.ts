import { create } from "zustand";
import type { Powder, PowderApiResponse } from "@/src/lib/types/powder";

interface PowderState {
  data: Powder[];
  defaultPowderGram: { size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }[];
  isLoaded: boolean;
  setPowderData: (res: PowderApiResponse) => void;
}

/**
 * Global store for powder catalog.
 * Hydrated once on app load to provide real-time pricing without fetching.
 */
export const usePowderStore = create<PowderState>((set) => ({
  data: [],
  defaultPowderGram: [],
  isLoaded: false,
  setPowderData: (res) =>
    set({
      data: res.data,
      defaultPowderGram: res.default_powder_gram,
      isLoaded: true,
    }),
}));
