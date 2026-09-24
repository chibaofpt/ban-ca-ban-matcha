import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockReserveProbe = vi.fn();
const mockReserveSend = vi.fn();
const mockFinalize = vi.fn();
const mockVerify = vi.fn();
const mockConnection = vi.fn();
const mockBalance = vi.fn();
const mockSend = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: (...args: unknown[]) => mockGetSession(...args) }));
vi.mock("@/lib/smsTestStore", () => ({
  SmsTestStoreUnavailable: class SmsTestStoreUnavailable extends Error {},
  reserveSmsTestProbe: (...args: unknown[]) => mockReserveProbe(...args),
  reserveSmsTestSend: (...args: unknown[]) => mockReserveSend(...args),
  finalizeSmsTestSend: (...args: unknown[]) => mockFinalize(...args),
  verifySmsTestOtp: (...args: unknown[]) => mockVerify(...args),
}));
vi.mock("@/lib/sms/abenla", () => ({
  AbenlaConfigError: class AbenlaConfigError extends Error {},
  AbenlaResponseError: class AbenlaResponseError extends Error {},
  AbenlaRejectedError: class AbenlaRejectedError extends Error {
    constructor(public readonly providerCode: number) { super(); }
  },
  checkAbenlaConnection: (...args: unknown[]) => mockConnection(...args),
  getAbenlaBalance: (...args: unknown[]) => mockBalance(...args),
  sendAbenlaOtp: (...args: unknown[]) => mockSend(...args),
}));

import { POST as connection } from "@/app/api/admin/sms-test/connection/route";
import { POST as balance } from "@/app/api/admin/sms-test/balance/route";
import { POST as sendOtp } from "@/app/api/admin/sms-test/send-otp/route";
import { POST as verifyOtp } from "@/app/api/admin/sms-test/verify-otp/route";
import { SmsTestStoreUnavailable } from "@/lib/smsTestStore";
import { AbenlaRejectedError } from "@/lib/sms/abenla";

const requestId = "ec3a144b-7bda-4272-95b4-fcd67ac93cda";
const challengeId = "ec3a144b-7bda-4272-95b4-fcd67ac93cdb";
const admin = { id: "admin-1", role: "ADMIN", phone_number: "+84912345678", session_id: "session-1" };

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/admin/sms-test/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("API kiểm thử SMS", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("ABENLA_SMS_TEST_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SMS_TEST_OTP_SECRET", "a-secret-with-at-least-thirty-two-characters");
    mockGetSession.mockResolvedValue(admin);
    mockReserveProbe.mockResolvedValue(true);
    mockReserveSend.mockResolvedValue({ kind: "new" });
    mockFinalize.mockResolvedValue(undefined);
    mockVerify.mockResolvedValue("VERIFIED");
    mockConnection.mockResolvedValue({ connected: true, providerCode: 106 });
    mockBalance.mockResolvedValue(42);
    mockSend.mockResolvedValue({ deliveryStatus: "accepted", providerCode: 203, smsPerMessage: 1 });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("ẩn endpoint ngoài staging preview trước khi đọc phiên", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await connection();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("chặn người chưa đăng nhập hoặc không có quyền ADMIN", async () => {
    mockGetSession.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...admin, role: "STAFF" });
    expect((await connection()).status).toBe(401);
    expect((await balance()).status).toBe(403);
    expect(mockConnection).not.toHaveBeenCalled();
    expect(mockBalance).not.toHaveBeenCalled();
  });

  it("giới hạn chung hai phép kiểm tra nhà cung cấp", async () => {
    expect(await (await connection()).json()).toMatchObject({ data: { connected: true, provider_code: 106 } });
    mockReserveProbe.mockResolvedValueOnce(false);
    const blocked = await balance();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "TOO_MANY_REQUESTS", details: { reason: "SMS_TEST_LIMIT" } });
    expect(mockReserveProbe.mock.calls[0][0]).toBe(mockReserveProbe.mock.calls[1][0]);
  });

  it("kiểm tra đầu vào trước khi gửi và chỉ trả số điện thoại đã che", async () => {
    const bad = await sendOtp(request("send-otp", { phone_number: "123", request_id: requestId }));
    expect(bad.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
    const response = await sendOtp(request("send-otp", {
      phone_number: "0912 345 678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ delivery_status: "accepted", provider_code: 203, sms_per_message: 1 });
    expect(body.data.masked_phone).not.toContain("912345678");
    expect(JSON.stringify(body)).not.toContain("0912345678");
    expect(mockSend).toHaveBeenCalledWith("+84912345678", expect.stringMatching(/^\d{6}$/), expect.any(String), "Mã kiểm tra {otp}");
  });

  it("từ chối template không có đúng một placeholder OTP", async () => {
    const response = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ details: { reason: "INVALID_MESSAGE_TEMPLATE" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("trả trạng thái xác minh hoặc lỗi OTP theo kết quả lưu trữ", async () => {
    const input = request("verify-otp", { challenge_id: challengeId, otp: "123456" });
    expect(await (await verifyOtp(input)).json()).toEqual({ data: { verified: true } });
    mockVerify.mockResolvedValueOnce("LOCKED");
    const locked = await verifyOtp(request("verify-otp", { challenge_id: challengeId, otp: "123456" }));
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ details: { reason: "OTP_LOCKED" } });
  });

  it("không gửi thêm SMS khi request_id được phát lại", async () => {
    const data = {
      challenge_id: challengeId, masked_phone: "+8491***678",
      expires_at: "2026-09-23T00:05:00.000Z", resend_at: "2026-09-23T00:01:00.000Z",
      delivery_status: "pending", provider_code: 212, sms_per_message: 1,
    };
    mockReserveSend.mockResolvedValueOnce({ kind: "replay", outcome: { data } });
    const response = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("thất bại an toàn khi Redis không sẵn sàng", async () => {
    mockReserveSend.mockRejectedValueOnce(new SmsTestStoreUnavailable());
    const response = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ details: { reason: "SMS_TEST_UNAVAILABLE" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("trả mã số nhà cung cấp khi Abenla từ chối, không trả nội dung nhạy cảm", async () => {
    mockSend.mockRejectedValueOnce(new AbenlaRejectedError(204));
    const response = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "SMS_PROVIDER_REJECTED", provider_code: 204 },
    });
    expect(JSON.stringify(body)).not.toContain("precomputed-signature");
    expect(JSON.stringify(body)).not.toContain("0912345678");
  });

  it("phát lại challenge chưa rõ khi lần gửi đầu còn chờ nhà cung cấp", async () => {
    let releaseSend!: (value: { deliveryStatus: string; providerCode: number; smsPerMessage: number }) => void;
    let sendStarted!: () => void;
    const providerPending = new Promise<{ deliveryStatus: string; providerCode: number; smsPerMessage: number }>(
      (resolve) => { releaseSend = resolve; },
    );
    const started = new Promise<void>((resolve) => { sendStarted = resolve; });
    let initialData: Record<string, unknown> = {};
    mockReserveSend.mockImplementationOnce(async (input: { initialData: Record<string, unknown> }) => {
      initialData = input.initialData;
      return { kind: "new" };
    }).mockImplementationOnce(async () => ({ kind: "replay", outcome: { data: initialData } }));
    mockSend.mockImplementationOnce(() => { sendStarted(); return providerPending; });

    const first = sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    await started;
    const replay = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(await replay.json()).toMatchObject({ data: {
      challenge_id: initialData.challenge_id, delivery_status: "unknown", provider_code: null,
    } });
    expect(mockSend).toHaveBeenCalledTimes(1);
    releaseSend({ deliveryStatus: "accepted", providerCode: 203, smsPerMessage: 1 });
    expect(await (await first).json()).toMatchObject({ data: { challenge_id: initialData.challenge_id, delivery_status: "accepted" } });
  });

  it("không gửi lại khi lưu kết quả sau dispatch thất bại", async () => {
    let initialData: Record<string, unknown> = {};
    mockReserveSend.mockImplementationOnce(async (input: { initialData: Record<string, unknown> }) => {
      initialData = input.initialData;
      return { kind: "new" };
    }).mockImplementationOnce(async () => ({ kind: "replay", outcome: { data: initialData } }));
    mockFinalize.mockRejectedValueOnce(new SmsTestStoreUnavailable());
    const first = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(first.status).toBe(503);
    const replay = await sendOtp(request("send-otp", {
      phone_number: "0912345678", request_id: requestId, message_template: "Mã kiểm tra {otp}",
    }));
    expect(await replay.json()).toMatchObject({ data: {
      challenge_id: initialData.challenge_id, delivery_status: "unknown", provider_code: null,
    } });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
