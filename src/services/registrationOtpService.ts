import { isAxiosError, type AxiosResponse } from "axios";
import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import type { ApiError, ApiResponse } from "@/contracts/api";
import type { RegistrationOtpAdminData, RegistrationOtpBalance, RegistrationOtpChallenge, RegistrationOtpConfig, RegistrationOtpSend, RegistrationOtpSettings } from "@/contracts/registrationOtp";

const URL = {
  otp: "/api/auth/register/otp",
  settings: "/api/admin/users/registration-settings",
  balance: "/api/admin/users/registration-settings/balance",
} as const;

export const registrationOtpKeys = {
  config: ["public", "registration-otp"] as const,
  settings: ["admin", "registration-settings"] as const,
  balance: ["admin", "registration-balance"] as const,
};

async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try { return (await request).data.data; }
  catch (error) {
    if (isAxiosError<ApiError>(error) && error.response &&
      typeof error.response.data?.error === "string" && typeof error.response.data.code === "string") {
      throw new ApiServiceError(error.response.data.error, error.response.status, error.response.data.code, error.response.data.details);
    }
    throw error;
  }
}

/** Read registration mode and cookie-bound challenge without persisting credentials. */
export async function getRegistrationOtpConfig(): Promise<RegistrationOtpConfig> {
  return unwrap(apiClient.get(URL.otp));
}

/** Send full registration details and idempotency ownership for one OTP request. */
export async function sendRegistrationOtp(input: RegistrationOtpSend): Promise<RegistrationOtpChallenge> {
  return unwrap(apiClient.post(URL.otp, input));
}

/** Read global settings and nullable reserved-send statistics for admin controls. */
export async function getRegistrationSettings(): Promise<RegistrationOtpAdminData> {
  return unwrap(apiClient.get(URL.settings));
}

/** Save global registration settings using the current optimistic revision. */
export async function updateRegistrationSettings(input: RegistrationOtpSettings): Promise<RegistrationOtpSettings> {
  return unwrap(apiClient.put(URL.settings, input));
}

/** Probe the provider balance with its authoritative diagnostic quota. */
export async function getRegistrationBalance(): Promise<RegistrationOtpBalance> {
  return unwrap(apiClient.post(URL.balance, {}));
}
