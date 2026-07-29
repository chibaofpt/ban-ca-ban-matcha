import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type {
  CustomerProfile,
  UpdateProfilePayload,
} from "@/src/lib/types/user";

const URL = {
  profile: "/api/profile",
} as const;

/** Fetch the current customer's profile. */
export async function getProfile(): Promise<CustomerProfile> {
  const response = await apiClient.get<ApiResponse<CustomerProfile>>(
    URL.profile,
  );
  return response.data.data;
}

/** Update editable fields for the current customer. */
export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<CustomerProfile> {
  const response = await apiClient.patch<ApiResponse<CustomerProfile>>(
    URL.profile,
    payload,
  );
  return response.data.data;
}
