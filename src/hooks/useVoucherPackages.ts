import { useQuery } from "@tanstack/react-query";
import { listActiveVoucherPackages } from "@/src/services/customerVoucherService";

/**
 * Hook fetch danh sách voucher packages có thể đổi.
 */
export function useVoucherPackages(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["voucher_packages"],
    queryFn: listActiveVoucherPackages,
    staleTime: 10 * 60 * 1000,
    enabled: options?.enabled,
  });
}
