import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createOrder } from "@/src/services/orderService";
import type { CartItem } from "@/src/lib/types/cart";

/**
 * Hook mutation cho việc tạo đơn hàng.
 * Tự động làm mới cache của points, orders, và vouchers sau khi đặt hàng thành công.
 */
export function useCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ items, options }: { items: CartItem[], options: NonNullable<Parameters<typeof createOrder>[1]> }) => 
      createOrder(items, options),
    onSuccess: () => {
      // Làm mới dữ liệu người dùng sau khi đặt hàng (thay đổi điểm, dùng voucher)
      queryClient.invalidateQueries({ queryKey: ["customer", "points"] });
      queryClient.invalidateQueries({ queryKey: ["customer", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["customer", "vouchers"] });
    },
  });
}
