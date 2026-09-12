import { apiClient } from "@/src/lib/api/client";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import type {
  ChangePasswordPayload,
  ChangePasswordResult,
  CustomerProfile,
  UpdateProfilePayload,
} from "@/src/lib/types/user";
import { ApiServiceError } from "@/src/services/orderService";

const URL = {
  profile: "/api/profile",
  password: "/api/profile/password",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toApiServiceError(error: unknown): ApiServiceError | null {
  if (!isRecord(error) || !isRecord(error.response)) return null;

  const status = error.response.status;
  const data = error.response.data;
  if (
    typeof status !== "number" ||
    !isRecord(data) ||
    typeof data.error !== "string" ||
    typeof data.code !== "string"
  ) {
    return null;
  }

  const payload: ApiError = {
    error: data.error,
    code: data.code,
    ...( "details" in data ? { details: data.details } : {}),
  };
  return new ApiServiceError(payload.error, status, payload.code, payload.details);
}

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

/** Changes the current customer's password and preserves the session contract. */
export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  try {
    const response = await apiClient.patch<ApiResponse<ChangePasswordResult>>(
      URL.password,
      payload,
    );
    if (response.data.data.success !== true) {
      throw new Error("Password change was not confirmed by the server");
    }
  } catch (error: unknown) {
    const apiError = toApiServiceError(error);
    if (apiError) throw apiError;
    throw error;
  }
}
