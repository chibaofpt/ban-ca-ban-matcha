import { useQuery } from "@tanstack/react-query";
import { getCustomerPoints } from "@/src/services/pointsService";

/**
 * Hook fetch và cache điểm cá của khách hàng.
 * Tự động cache 5 phút. Để update lại điểm sau khi đặt hàng hoặc đổi voucher,
 * sử dụng: queryClient.invalidateQueries({ queryKey: ["customer", "points"] })
 */
export function useCustomerPoints(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["customer", "points"],
    queryFn: () => getCustomerPoints(1, 20),
    select: (data) => data.points_balance,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: "always",
    enabled: options?.enabled,
  });
}

/** Fetches the customer's points history for the profile bottom sheet. */
export function useCustomerPointsHistory(page = 1) {
  return useQuery({
    queryKey: ["customer", "points", "history", page],
    queryFn: () => getCustomerPoints(page, 20),
    refetchOnWindowFocus: "always",
  });
}
