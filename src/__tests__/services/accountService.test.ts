import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({ apiClient: { post: vi.fn(), patch: vi.fn() } }));

import { apiClient } from "@/src/lib/api/client";
import { createGoogleChallenge, getClaimContext, submitGoogleCredential, claimAccountPassword, createAccountClaimLink, updateAccountPhone, sendAccountPhoneOtp, confirmAccountPhoneOtp } from "@/src/services/accountService";

describe("Service tài khoản Google — FRONTEND_CONTRACT", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gửi purpose và CAPTCHA tới challenge rồi giữ nonce của server", async () => {
    const payload = { purpose: "LOGIN" as const, turnstile_token: "captcha-token" };
    const result = { challenge_id: "challenge", nonce: "server-nonce", expires_at: "2026-10-09T07:00:00Z" };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: result } });
    expect(await createGoogleChallenge(payload)).toEqual(result);
    expect(apiClient.post).toHaveBeenCalledWith("/api/auth/google/challenge", payload);
  });
  it("chuẩn bị LOGIN không CAPTCHA và gửi token ngầm khi đổi credential", async () => {
    const prepared = { challenge_id: "login.signed.preparation.proof", nonce: "nonce", expires_at: "2026-10-11T07:00:00Z" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: prepared } });
    await expect(createGoogleChallenge({ purpose: "LOGIN" })).resolves.toEqual(prepared);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/auth/google/challenge", { purpose: "LOGIN" });
    const session = { qr_token: "public-qr", name: "Cá", phone_number: null, email: "ca@gmail.com", role: "CUSTOMER", welcome_reward: null };
    const payload = { challenge_id: prepared.challenge_id, credential: "google-jwt", turnstile_token: "background-captcha" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: session } });
    await expect(submitGoogleCredential(payload)).resolves.toEqual(session);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/auth/google", payload);
  });
  it("giữ nguyên lỗi CAPTCHA để UI có thể thử lại", async () => {
    vi.mocked(apiClient.post).mockRejectedValue({ response: { status: 503, data: { error: "Xác minh chưa khả dụng", code: "SERVICE_UNAVAILABLE", details: { reason: "TURNSTILE_UNAVAILABLE" } } } });
    await expect(submitGoogleCredential({ challenge_id: "login.signed.preparation.proof", credential: "google-jwt", turnstile_token: "captcha" }))
      .rejects.toMatchObject({ message: "Xác minh chưa khả dụng", status: 503, code: "SERVICE_UNAVAILABLE", details: { reason: "TURNSTILE_UNAVAILABLE" } });
  });
});
it("preserves structured API failures including collision reason", async () => {
  vi.mocked(apiClient.post).mockRejectedValue({ response: { status: 422, data: { error: "Nhận tài khoản chưa khả dụng", code: "BUSINESS_RULE_VIOLATION", details: { reason: "OTP_DISABLED" } } } });
  await expect(createGoogleChallenge({ purpose: "CLAIM", turnstile_token: "t" })).rejects.toMatchObject({ message: "Nhận tài khoản chưa khả dụng", status: 422, code: "BUSINESS_RULE_VIOLATION", details: { reason: "OTP_DISABLED" } });
});
describe("new account endpoints — FRONTEND_CONTRACT", () => {
  beforeEach(() => vi.clearAllMocks());
  it("binds raw claim token once and resumes context with an empty body", async () => {
    const context = { expires_at: "2026-10-09T08:00:00Z", server_now: "2026-10-09T07:50:00Z" };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: context } });
    await expect(getClaimContext("raw-token")).resolves.toEqual(context);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/auth/claim/context", { token: "raw-token" });
    await getClaimContext();
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/auth/claim/context", {});
  });
  it("unwraps flat account sessions and reauthentication proofs without discarding either", async () => {
    const session = { qr_token: "google-public-qr", name: "Cá", phone_number: null, role: "CUSTOMER", email: "ca@example.com", welcome_reward: null };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: session } }).mockResolvedValueOnce({ data: { data: { reauth_proof: "one-use-proof" } } });
    await expect(submitGoogleCredential({ challenge_id: "challenge", credential: "google-jwt" })).resolves.toEqual(session);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/auth/google", { challenge_id: "challenge", credential: "google-jwt" });
    await expect(submitGoogleCredential({ challenge_id: "reauth", credential: "jwt" })).resolves.toEqual({ reauth_proof: "one-use-proof" });
  });
  it("sends password confirmation and encodes claim target", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { url: "https://shop.test/nhan-tai-khoan#claim", expires_at: "later", server_now: "now" } } });
    const payload = { password: "secret1", password_confirmation: "secret1", turnstile_token: "captcha" };
    await claimAccountPassword(payload);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/auth/claim/password", payload);
    await createAccountClaimLink("public/qr");
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/admin/users/public%2Fqr/claim-link", {});
  });
  it("sends phone save, paid OTP idempotency and canonical-session confirmation exactly once", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: { status: "verification_required" } } });
    await expect(updateAccountPhone("+84912345678")).resolves.toEqual({ status: "verification_required" });
    expect(apiClient.patch).toHaveBeenCalledWith("/api/profile/phone", { phone_number: "+84912345678" });
    const send = { phone_number: "+84912345678", request_id: "request-uuid", turnstile_token: "captcha" };
    const challenge = { challenge_id: "otp", masked_phone: "***678", expires_at: "2026-10-10T04:50:00Z", resend_at: "2026-10-10T04:46:00Z", server_now: "2026-10-10T04:45:00Z", delivery_status: "unknown" };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: challenge } });
    await expect(sendAccountPhoneOtp(send)).resolves.toEqual(challenge);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/profile/phone/otp", send);
    const confirm = { phone_number: "+84912345678", challenge_id: "otp", otp: "123456" };
    const result = { qr_token: "canonical-legacy-qr", name: "Cá", phone_number: "+84912345678", role: "CUSTOMER", welcome_reward: null };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: result } });
    await expect(confirmAccountPhoneOtp(confirm)).resolves.toEqual(result);
    expect(apiClient.post).toHaveBeenLastCalledWith("/api/profile/phone/confirm", confirm);
  });
  it("does not turn a disconnected transport into a server error", async () => {
    const failure = new Error("offline");
    vi.mocked(apiClient.post).mockRejectedValue(failure);
    await expect(getClaimContext()).rejects.toBe(failure);
  });
});
