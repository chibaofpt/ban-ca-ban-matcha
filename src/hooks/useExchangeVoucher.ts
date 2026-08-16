import { useMutation, useQueryClient } from "@tanstack/react-query";
import { exchangeVoucher } from "@/src/services/customerVoucherService";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";

/**
 * Hook mutation đổi voucher bằng điểm cá.
 * Tự động làm mới điểm cá và danh sách voucher sau khi đổi thành công.
 */
export function useExchangeVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packageId: string) => exchangeVoucher(packageId),
    onSuccess: () => {
      // Invalidate points, packages, and vouchers caches
      queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_POINTS });
      queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.VOUCHER_PACKAGES });
      queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS });
    },
  });
}
