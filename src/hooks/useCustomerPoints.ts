import { useQuery } from "@tanstack/react-query";
import { getCustomerPoints } from "@/src/services/pointsService";

const customerPointsKey = (page: number, limit: number) =>
  ["customer", "points", { page, limit }] as const;

/**
 * Hook fetch và cache điểm cá của khách hàng.
 * Tự động cache 5 phút. Để update lại điểm sau khi đặt hàng hoặc đổi voucher,
 * sử dụng: queryClient.invalidateQueries({ queryKey: ["customer", "points"] })
 */
export function useCustomerPoints(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: customerPointsKey(1, 10),
    queryFn: () => getCustomerPoints(1, 10),
    select: (data) => data.points_balance,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: "always",
    enabled: options?.enabled,
  });
}

/** Fetches one page of the customer's grouped point history. */
export function useCustomerPointsHistory(page = 1, limit = 10, enabled = true) {
  return useQuery({
    queryKey: customerPointsKey(page, limit),
    queryFn: () => getCustomerPoints(page, limit),
    refetchOnWindowFocus: "always",
    enabled,
  });
}
