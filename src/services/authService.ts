import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/contracts/api";
import type {
  AuthUser,
  LoginPayload,
  PhoneCheckResult,
  RegisterPayload,
  RegisterResult,
} from "@/contracts/auth";

export type { LoginPayload, RegisterPayload, RegisterResult } from "@/contracts/auth";

const URL = {
  register:   "/api/auth/register",
  login:      "/api/auth/login",
  logout:     "/api/auth/logout",
  checkPhone: "/api/auth/check-phone",
  me:         "/api/auth/me",
} as const;

/** Check whether a phone number is already registered */
export async function checkPhone(phone_number: string): Promise<PhoneCheckResult> {
  const res = await apiClient.post<ApiResponse<PhoneCheckResult>>(URL.checkPhone, { phone_number });
  return res.data.data;
}

/** Register a new account */
export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  const res = await apiClient.post<ApiResponse<RegisterResult>>(URL.register, payload);
  return res.data.data;
}

/** Login — access token is set as httpOnly cookie automatically */
export async function login(payload: LoginPayload): Promise<AuthUser> {
  const res = await apiClient.post<ApiResponse<AuthUser>>(URL.login, payload);
  return res.data.data;
}

/** Logout and destroy session */
export async function logout(): Promise<void> {
  await apiClient.post(URL.logout);
}


