import { useQuery } from "@tanstack/react-query";
import { listActiveVoucherPackages } from "@/src/services/customerVoucherService";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";

/**
 * Hook fetch danh sách voucher packages có thể đổi.
 */
export function useVoucherPackages(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES,
    queryFn: listActiveVoucherPackages,
    staleTime: 10 * 60 * 1000,
    enabled: options?.enabled,
  });
}
