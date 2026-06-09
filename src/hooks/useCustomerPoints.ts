import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/src/lib/api/client";

interface PointsResponse {
  data: {
    points: number;
  };
}

/**
 * Hook fetch và cache điểm cá của khách hàng.
 * Tự động cache 5 phút. Để update lại điểm sau khi đặt hàng hoặc đổi voucher,
 * sử dụng: queryClient.invalidateQueries({ queryKey: ["customer", "points"] })
 */
export function useCustomerPoints() {
  return useQuery({
    queryKey: ["customer", "points"],
    queryFn: async () => {
      const res = await apiClient.get<PointsResponse>("/api/customer/points");
      return res.data.data.points;
    },
    staleTime: 5 * 60 * 1000,
  });
}
