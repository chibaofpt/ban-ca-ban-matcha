import { useQuery } from "@tanstack/react-query";
import { getStoreStatus } from "@/src/services/storeStatusService";

export const STORE_STATUS_QUERY_KEY = ["store-status"] as const;

interface UseStoreStatusOptions {
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

/**
 * Fetch and cache store open/closed status via TanStack Query.
 */
export function useStoreStatus(options?: UseStoreStatusOptions) {
  return useQuery({
    queryKey: STORE_STATUS_QUERY_KEY,
    queryFn: getStoreStatus,
    enabled: options?.enabled ?? true,
  });
}
