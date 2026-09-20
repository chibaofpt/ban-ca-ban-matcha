import type { WelcomeRewardSummary } from "./reward";

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

/** Public identity returned after login or registration. */
export interface AuthUser {
  name: string;
  phone_number: string;
  insta_name: string | null;
  role: Role;
}

export interface RegisterPayload {
  name: string;
  phone_number: string;
  password: string;
  insta_name?: string;
}

export interface RegisterResult extends AuthUser {
  welcome_reward: WelcomeRewardSummary;
}

export type LoginPayload =
  | { phone_number: string; password: string; insta_name?: never }
  | { insta_name: string; password: string; phone_number?: never };

export interface PhoneCheckResult {
  exists: boolean;
}
