import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { AuthUser } from "@/src/lib/types/user";

const URL = {
  register:   "/api/auth/register",
  login:      "/api/auth/login",
  logout:     "/api/auth/logout",
  checkPhone: "/api/auth/check-phone",
  me:         "/api/auth/me",
} as const;

export interface RegisterPayload {
  name: string;
  phone_number: string;
  password: string;
}

export interface LoginPayload {
  phone_number: string;
  password: string;
}

/** Check whether a phone number is already registered */
export async function checkPhone(phone_number: string): Promise<{ exists: boolean }> {
  const res = await apiClient.post<ApiResponse<{ exists: boolean }>>(URL.checkPhone, { phone_number });
  return res.data.data;
}

/** Register a new account */
export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const res = await apiClient.post<ApiResponse<AuthUser>>(URL.register, payload);
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


