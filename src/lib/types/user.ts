export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface User {
  id: string;
  name: string;
  phone_number: string;
  insta_name: string | null;
  role: Role;
  points_balance: number;
  qr_token: string;
  otp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Public auth result returned after login or registration. */
export type AuthUser = Pick<
  User,
  "name" | "phone_number" | "insta_name" | "role"
>;

/** Public profile fields returned for the current customer. */
export type CustomerProfile = Pick<
  User,
  "name" | "phone_number" | "insta_name" | "points_balance" | "qr_token"
>;

export interface UpdateProfilePayload {
  name?: string;
  insta_name?: string | null;
  current_password?: string;
}
