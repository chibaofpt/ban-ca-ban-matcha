export type SmsTestDeliveryStatus = "accepted" | "pending" | "unknown";

export interface SmsTestConnectionData {
  connected: boolean;
  provider_code: number;
  checked_at: string;
}

export interface SmsTestBalanceData {
  balance: number;
  checked_at: string;
}

export interface SmsTestSendOtpRequest {
  phone_number: string;
  request_id: string;
  message_template: string;
}

export interface SmsTestSendOtpData {
  challenge_id: string;
  masked_phone: string;
  expires_at: string;
  resend_at: string;
  delivery_status: SmsTestDeliveryStatus;
  provider_code: number | null;
  sms_per_message: number | null;
}

export interface SmsTestVerifyOtpRequest {
  challenge_id: string;
  otp: string;
}

export interface SmsTestVerifyOtpData {
  verified: true;
}

export interface SmsTestErrorDetails {
  reason: string;
  provider_code?: number;
}
