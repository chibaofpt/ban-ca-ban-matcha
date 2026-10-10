/** Public profile fields returned for the current customer. */
export interface CustomerProfile {
  name: string;
  phone_number: string | null;
  email: string | null;
  google_connected: boolean;
  has_password: boolean;
  can_set_password: boolean;
  insta_name: string | null;
  points_balance: number;
  qr_token: string;
}

export interface UpdateProfilePayload {
  name?: string;
  insta_name?: string | null;
  current_password?: string;
  reauth_proof?: string;
}

export interface ChangePasswordPayload {
  current_password?: string;
  reauth_proof?: string;
  new_password: string;
}

export interface ChangePasswordResult {
  success: true;
}
