"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAdminPendingTransferCount } from "@/src/services/adminOrderService";

export const ADMIN_PENDING_TRANSFER_KEY = ["admin", "orders", "pending-transfer-count"] as const;

/** Share the global admin badge read with the order view and preserve cached data on errors. */
export function useAdminPendingTransferCount(enabled = true) {
  return useQuery({
    queryKey: ADMIN_PENDING_TRANSFER_KEY,
    queryFn: fetchAdminPendingTransferCount,
    enabled,
    refetchInterval: 20_000,
    refetchOnWindowFocus: "always",
  });
}
