import { useQuery } from "@tanstack/react-query";
import { listMyVouchers } from "@/src/services/customerVoucherService";

/**
 * Hook fetch danh sách vouchers của khách hàng.
 */
export function useCustomerVouchers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["customer", "vouchers"],
    queryFn: listMyVouchers,
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled,
  });
}
