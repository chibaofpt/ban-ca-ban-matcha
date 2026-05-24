import { create } from "zustand";
import type { StoreOpenReason } from "@/src/services/storeStatusService";

interface StoreStatusState {
  /** Whether the store is currently open for PICKUP/DELIVERY orders. */
  is_open: boolean;
  /** Why the store is in its current state. Null = not yet loaded. */
  reason: StoreOpenReason | null;
  /** Optional admin note shown to customers during temporary closure. */
  closure_note: string | null;
  /** True once /api/store-status has been fetched at least once. */
  isLoaded: boolean;
  /** Hydrate store from API response. */
  setStoreStatus: (status: { is_open: boolean; reason: StoreOpenReason; closure_note: string | null }) => void;
}

/**
 * Global store for store open/closed status.
 * Hydrated once on HomePage load. Read in CartDrawer to gate order submission.
 */
export const useStoreStatusStore = create<StoreStatusState>((set) => ({
  is_open: true,
  reason: null,
  closure_note: null,
  isLoaded: false,
  setStoreStatus: ({ is_open, reason, closure_note }) =>
    set({ is_open, reason, closure_note, isLoaded: true }),
}));

/** Selector — returns true only when store is confirmed open. */
export const useIsStoreOpen = () => useStoreStatusStore((s) => s.is_open);
