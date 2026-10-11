import { type AxiosResponse } from "axios";
import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import type { ApiResponse } from "@/contracts/api";
import type {
  AccountAuthResult, ClaimContextResult, ClaimLinkResult, ClaimPasswordPayload,
  GoogleChallengePayload, GoogleChallengeResult, GoogleCredentialPayload, GoogleCredentialResult,
  PhoneOtpConfirmPayload, PhoneOtpRequestPayload, PhoneUpdateResult,
} from "@/contracts/account";
import type { RegistrationOtpChallenge } from "@/contracts/registrationOtp";

const URL = {
  googleChallenge: "/api/auth/google/challenge",
  google: "/api/auth/google",
  claimContext: "/api/auth/claim/context",
  claimPassword: "/api/auth/claim/password",
  phone: "/api/profile/phone",
  phoneOtp: "/api/profile/phone/otp",
  phoneConfirm: "/api/profile/phone/confirm",
  adminUsers: "/api/admin/users",
} as const;

async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try { return (await request).data.data; }
  catch (error: unknown) {
    if (typeof error === "object" && error !== null && "response" in error) {
      const response = (error as { response?: { status?: number; data?: { error?: unknown; code?: unknown; details?: unknown } } }).response;
      if (typeof response?.status === "number" && typeof response.data?.error === "string" && typeof response.data.code === "string") {
        throw new ApiServiceError(response.data.error, response.status, response.data.code, response.data.details);
      }
    }
    throw error;
  }
}

/** Create a browser-bound Google challenge for one explicit purpose. */
export async function createGoogleChallenge(payload: GoogleChallengePayload): Promise<GoogleChallengeResult> {
  return unwrap(apiClient.post(URL.googleChallenge, payload));
}

/** Exchange the Google credential using its original browser-bound challenge. */
export async function submitGoogleCredential(payload: GoogleCredentialPayload): Promise<GoogleCredentialResult> {
  return unwrap(apiClient.post(URL.google, payload));
}

/** Bind a claim fragment once or resume its existing httpOnly cookie context. */
export async function getClaimContext(token?: string): Promise<ClaimContextResult> {
  return unwrap(apiClient.post(URL.claimContext, token ? { token } : {}));
}

/** @deprecated Password claims are retired; this compatibility call preserves the server's 410. */
export async function claimAccountPassword(payload: ClaimPasswordPayload): Promise<AccountAuthResult> {
  return unwrap(apiClient.post(URL.claimPassword, payload));
}

/** Create a new single-use verification link for an eligible customer. */
export async function createAccountClaimLink(qrToken: string): Promise<ClaimLinkResult> {
  return unwrap(apiClient.post(`${URL.adminUsers}/${encodeURIComponent(qrToken)}/claim-link`, {}));
}

/** Save a phone or request the server's collision-only verification flow. */
export async function updateAccountPhone(phone_number: string): Promise<PhoneUpdateResult> {
  return unwrap(apiClient.patch(URL.phone, { phone_number }));
}

/** Request a phone-claim OTP with explicit idempotency and CAPTCHA ownership. */
export async function sendAccountPhoneOtp(payload: PhoneOtpRequestPayload): Promise<RegistrationOtpChallenge> {
  return unwrap(apiClient.post(URL.phoneOtp, payload));
}

/** Confirm the colliding phone and receive the canonical account session. */
export async function confirmAccountPhoneOtp(payload: PhoneOtpConfirmPayload): Promise<AccountAuthResult> {
  return unwrap(apiClient.post(URL.phoneConfirm, payload));
}
