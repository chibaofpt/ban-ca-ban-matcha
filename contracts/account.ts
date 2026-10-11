import type { AuthUser } from "./auth";
import type { WelcomeRewardSummary } from "./reward";

export type GoogleAuthPurpose = "LOGIN" | "CLAIM" | "LINK" | "REAUTH";

export type GoogleChallengePayload = {
  purpose: "LOGIN" | "CLAIM";
  turnstile_token?: string;
  current_password?: string;
} | {
  purpose: Exclude<GoogleAuthPurpose, "LOGIN" | "CLAIM">;
  turnstile_token: string;
  current_password?: string;
};
export interface GoogleChallengeResult {
  challenge_id: string;
  nonce: string;
  expires_at: string;
}
export interface GoogleCredentialPayload {
  challenge_id: string;
  credential: string;
  turnstile_token?: string;
}
export interface AccountAuthResult extends AuthUser {
  welcome_reward: WelcomeRewardSummary | null;
}
export interface GoogleReauthResult {
  reauth_proof: string;
}
export type GoogleCredentialResult = AccountAuthResult | GoogleReauthResult;
export interface ClaimLinkResult {
  url: string;
  expires_at: string;
  server_now: string;
}
export interface ClaimContextResult {
  phone_number: string;
  expires_at: string;
  server_now: string;
}
export interface ClaimPasswordPayload {
  password: string;
  password_confirmation: string;
  turnstile_token: string;
}
export interface AccountCapabilities {
  google_connected: boolean;
  has_password: boolean;
  can_set_password: boolean;
}
export interface PhoneUpdateResult {
  status: "saved" | "verification_required";
}
export interface PhoneOtpRequestPayload {
  phone_number: string;
  request_id: string;
  turnstile_token: string;
}
export interface PhoneOtpConfirmPayload {
  phone_number: string;
  challenge_id: string;
  otp: string;
}
