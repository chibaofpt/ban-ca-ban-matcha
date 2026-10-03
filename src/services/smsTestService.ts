import { isAxiosError, type AxiosResponse } from "axios";
import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import type { ApiError, ApiResponse } from "@/contracts/api";
import type {
  SmsTestBalanceData,
  SmsTestConnectionData,
  SmsTestSendOtpData,
  SmsTestSendOtpRequest,
  SmsTestVerifyOtpData,
  SmsTestVerifyOtpRequest,
} from "@/contracts/smsTest";

const URL = {
  connection: "/api/admin/sms-test/connection",
  balance: "/api/admin/sms-test/balance",
  sendOtp: "/api/admin/sms-test/send-otp",
  verifyOtp: "/api/admin/sms-test/verify-otp",
} as const;

async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try {
    return (await request).data.data;
  } catch (error: unknown) {
    if (
      isAxiosError<ApiError>(error) && error.response &&
      typeof error.response.data?.error === "string" &&
      typeof error.response.data.code === "string"
    ) {
      throw new ApiServiceError(
        error.response.data.error,
        error.response.status,
        error.response.data.code,
        error.response.data.details,
      );
    }
    throw error;
  }
}

/** Check whether the configured Abenla account is reachable from staging. */
export async function checkSmsConnection(): Promise<SmsTestConnectionData> {
  return unwrap(apiClient.post(URL.connection, {}));
}

/** Read the current Abenla account balance. */
export async function getSmsBalance(): Promise<SmsTestBalanceData> {
  return unwrap(apiClient.post(URL.balance, {}));
}

/** Request one staged OTP delivery for the supplied Vietnamese mobile number. */
export async function sendTestOtp(request: SmsTestSendOtpRequest): Promise<SmsTestSendOtpData> {
  return unwrap(apiClient.post(URL.sendOtp, request));
}

/** Verify a staged OTP against the current server-side challenge. */
export async function verifyTestOtp(request: SmsTestVerifyOtpRequest): Promise<SmsTestVerifyOtpData> {
  return unwrap(apiClient.post(URL.verifyOtp, request));
}
