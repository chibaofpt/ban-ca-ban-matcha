import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/src/lib/api/client";
import { ApiServiceError } from "@/src/lib/api/serviceError";

vi.mock("@/src/lib/api/client", () => ({ apiClient: { post: vi.fn() } }));

import {
  checkSmsConnection,
  getSmsBalance,
  sendTestOtp,
  verifyTestOtp,
} from "@/src/services/smsTestService";

describe("hợp đồng service thử SMS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi kiểm tra kết nối và mở đúng response envelope", async () => {
    const data = { connected: true, provider_code: 106, checked_at: "2026-09-23T09:00:00Z" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data } });

    await expect(checkSmsConnection()).resolves.toEqual(data);
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/sms-test/connection", {});
  });

  it("đọc số dư theo endpoint quản trị", async () => {
    const data = { balance: 10000, checked_at: "2026-09-23T09:00:00Z" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data } });

    await expect(getSmsBalance()).resolves.toEqual(data);
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/sms-test/balance", {});
  });

  it("gửi số điện thoại và request_id rồi trả challenge", async () => {
    const request = {
      phone_number: "0912345678", request_id: "550e8400-e29b-41d4-a716-446655440000",
      message_template: "Mã kiểm tra {otp}",
    };
    const data = {
      challenge_id: "challenge-1", masked_phone: "******5678",
      expires_at: "2026-09-23T09:05:00Z", resend_at: "2026-09-23T09:01:00Z",
      delivery_status: "accepted", provider_code: 203, sms_per_message: 1,
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data } });

    await expect(sendTestOtp(request)).resolves.toEqual(data);
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/sms-test/send-otp", request);
  });

  it("xác minh mã và giữ nguyên lỗi có cấu trúc", async () => {
    const request = { challenge_id: "challenge-1", otp: "123456" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: { verified: true } } });
    await expect(verifyTestOtp(request)).resolves.toEqual({ verified: true });
    expect(apiClient.post).toHaveBeenCalledWith("/api/admin/sms-test/verify-otp", request);

    vi.mocked(apiClient.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 422, data: { error: "Mã chưa đúng", code: "BUSINESS_RULE_VIOLATION", details: { reason: "OTP_INVALID" } } },
    });
    await expect(verifyTestOtp(request)).rejects.toMatchObject({
      name: ApiServiceError.name,
      message: "Mã chưa đúng", status: 422, code: "BUSINESS_RULE_VIOLATION", details: { reason: "OTP_INVALID" },
    });
  });
});
