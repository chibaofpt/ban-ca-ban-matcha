import type { RegisterPayload } from "./auth";

export interface RegistrationOtpChallenge {
  challenge_id: string;
  masked_phone: string;
  server_now: string;
  expires_at: string;
  resend_at: string;
  delivery_status: "accepted" | "pending" | "unknown";
  provider_code?: number | null;
  sms_per_message?: number | null;
}

export interface RegistrationOtpConfig {
  enabled: boolean;
  turnstile: { site_key: string; action: "registration_otp" } | null;
  challenge: RegistrationOtpChallenge | null;
}

export interface RegistrationOtpSend extends RegisterPayload {
  request_id: string;
  turnstile_token: string;
}

export interface RegistrationOtpSettings {
  otp_enabled: boolean;
  daily_send_limit: number;
  revision: number;
}

export interface RegistrationOtpAdminData extends RegistrationOtpSettings {
  today_reserved_count: number | null;
  estimated_cost_vnd: number | null;
  stats_unavailable: boolean;
  date: string;
}

export interface RegistrationOtpBalance {
  balance: number;
  checked_at: string;
}
