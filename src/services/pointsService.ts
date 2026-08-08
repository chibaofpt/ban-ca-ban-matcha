import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { CustomerPointsData } from "@/src/lib/types/points";

const URL = { profilePoints: "/api/profile/points" } as const;

/** Fetches the current customer's points balance and paginated immutable log. */
export async function getCustomerPoints(
  page = 1,
  limit = 10,
): Promise<CustomerPointsData> {
  const response = await apiClient.get<ApiResponse<CustomerPointsData>>(
    URL.profilePoints,
    { params: { page, limit } },
  );
  return response.data.data;
}
