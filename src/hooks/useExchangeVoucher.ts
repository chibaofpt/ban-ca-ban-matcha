import { useMutation, useQueryClient } from "@tanstack/react-query";
import { exchangeVoucher } from "@/src/services/customerVoucherService";

/**
 * Hook mutation đổi voucher bằng điểm cá.
 * Tự động làm mới điểm cá và danh sách voucher sau khi đổi thành công.
 */
export function useExchangeVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packageId: string) => exchangeVoucher(packageId),
    onSuccess: () => {
      // Invalidate both points and vouchers caches
      queryClient.invalidateQueries({ queryKey: ["customer", "points"] });
      queryClient.invalidateQueries({ queryKey: ["customer", "vouchers"] });
    },
  });
}
