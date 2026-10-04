"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAdminPendingTransferCount } from "@/src/services/adminOrderService";
import { useOrderRealtime } from "@/src/components/shared/OrderRealtimeProvider";

export const ADMIN_PENDING_TRANSFER_KEY = ["admin", "orders", "pending-transfer-count"] as const;

/** Share the global admin badge read with the order view and preserve cached data on errors. */
export function useAdminPendingTransferCount(enabled = true) {
  const realtimeConnected = useOrderRealtime();
  return useQuery({
    queryKey: ADMIN_PENDING_TRANSFER_KEY,
    queryFn: fetchAdminPendingTransferCount,
    enabled,
    refetchInterval: realtimeConnected ? 300_000 : 20_000,
    refetchOnWindowFocus: "always",
  });
}
