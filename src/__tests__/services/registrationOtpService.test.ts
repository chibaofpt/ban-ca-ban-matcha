import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import { getRegistrationOtpConfig, sendRegistrationOtp, getRegistrationSettings, updateRegistrationSettings, getRegistrationBalance } from "@/src/services/registrationOtpService";

vi.mock("@/src/lib/api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
describe("Service OTP đăng ký — FRONTEND_CONTRACT", () => {
  beforeEach(() => vi.clearAllMocks());
  it("GET cấu hình cookie và giữ nguyên DTO challenge hiện tại", async () => {
    const data = { enabled: true, turnstile: { site_key: "public", action: "registration_otp" }, challenge: null };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data } });
    expect(await getRegistrationOtpConfig()).toEqual(data);
    expect(apiClient.get).toHaveBeenCalledWith("/api/auth/register/otp");
  });
  it("POST đầy đủ thông tin, quyền request và token đúng một lần", async () => {
    const payload = { name: "Bạn Cá", phone_number: "0912345678", password: "secret12", insta_name: "ban.ca", request_id: "request", turnstile_token: "token" };
    const data = { challenge_id: "id", masked_phone: "+8491***678", expires_at: "expiry", resend_at: "retry", delivery_status: "unknown" };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data } });
    expect(await sendRegistrationOtp(payload)).toEqual(data);
    expect(apiClient.post).toHaveBeenCalledWith("/api/auth/register/otp", payload);
    expect(apiClient.post).toHaveBeenCalledOnce();
  });
  it("giữ thống kê không khả dụng null, revision và số dư bằng không", async () => {
    const config = { otp_enabled: false, daily_send_limit: 100, revision: 2, today_reserved_count: null, estimated_cost_vnd: null, date: "2026-10-04", stats_unavailable: true };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: config } });
    expect(await getRegistrationSettings()).toEqual(config);
    expect(apiClient.get).toHaveBeenCalledWith("/api/admin/users/registration-settings");
    const update = { otp_enabled: true, daily_send_limit: 50, revision: 2 };
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { ...update, revision: 3 } } });
    expect(await updateRegistrationSettings(update)).toEqual({ ...update, revision: 3 });
    expect(apiClient.put).toHaveBeenCalledWith("/api/admin/users/registration-settings", update);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { balance: 0, checked_at: "time" } } });
    expect(await getRegistrationBalance()).toEqual({ balance: 0, checked_at: "time" });
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/users/registration-settings/balance", {});
  });
  it.each([400, 401, 403, 409, 422, 429, 502, 503])("giữ status server %s, message, code và details", async (status) => {
    vi.mocked(apiClient.get).mockRejectedValue({
      isAxiosError: true, response: { status, data: { error: "Thông báo server", code: "BUSINESS_RULE_VIOLATION", details: { reason: "OTP_LOCKED", retry_at: "time" } } },
    });
    await expect(getRegistrationOtpConfig()).rejects.toMatchObject({
      name: ApiServiceError.name, status, message: "Thông báo server", code: "BUSINESS_RULE_VIOLATION", details: { reason: "OTP_LOCKED", retry_at: "time" },
    });
  });
  it("giữ lỗi mạng riêng với lỗi API từ server", async () => {
    const error = new Error("network"); vi.mocked(apiClient.get).mockRejectedValue(error);
    await expect(getRegistrationOtpConfig()).rejects.toBe(error);
  });
});
