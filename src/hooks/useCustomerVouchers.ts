import { useQuery } from "@tanstack/react-query";
import { listMyVouchers } from "@/src/services/customerVoucherService";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";

/**
 * Hook fetch danh sách vouchers của khách hàng.
 */
export function useCustomerVouchers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS,
    queryFn: listMyVouchers,
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled,
  });
}
