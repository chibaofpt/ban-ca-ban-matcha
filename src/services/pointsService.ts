import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { PointsLogEntry } from "@/src/utils/customerUx";

export interface CustomerPointsData {
  points_balance: number;
  logs: PointsLogEntry[];
  meta: {
    total: number;
    page: number;
    totalPages: number;
  };
}

/** Fetches the current customer's points balance and paginated immutable log. */
export async function getCustomerPoints(
  page = 1,
  limit = 20,
): Promise<CustomerPointsData> {
  const response =
    page === 1 && limit === 20
      ? await apiClient.get<ApiResponse<CustomerPointsData>>("/api/profile/points")
      : await apiClient.get<ApiResponse<CustomerPointsData>>("/api/profile/points", {
          params: { page, limit },
        });
  return response.data.data;
}
