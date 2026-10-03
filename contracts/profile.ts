/** Public profile fields returned for the current customer. */
export interface CustomerProfile {
  name: string;
  phone_number: string;
  insta_name: string | null;
  points_balance: number;
  qr_token: string;
}

export interface UpdateProfilePayload {
  name?: string;
  insta_name?: string | null;
  current_password?: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResult {
  success: true;
}
