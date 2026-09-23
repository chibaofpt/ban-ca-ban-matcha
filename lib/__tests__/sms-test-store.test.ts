import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SmsTestSendOtpData } from "@/contracts/smsTest";

const mockEval = vi.fn();
const mockGetRedisClient = vi.fn();
vi.mock("@/lib/redis", () => ({ getRedisClient: () => mockGetRedisClient() }));

import { reserveSmsTestSend, SmsTestStoreUnavailable } from "@/lib/smsTestStore";

const data: SmsTestSendOtpData = {
  challenge_id: "challenge-original", masked_phone: "+8491***678",
  expires_at: "2026-09-23T00:05:00.000Z", resend_at: "2026-09-23T00:01:00.000Z",
  delivery_status: "accepted", provider_code: 203, sms_per_message: 1,
};

const input = {
  idempotencyKey: "idem", activeKey: "active", markerKey: "marker",
  cooldownKey: "cooldown", adminLimitKey: "admin-limit", globalLimitKey: "global-limit",
  challengeId: "challenge-new", phoneDigest: "phone-digest", sessionScope: "session-scope", otpHash: "otp-hash",
  initialData: data, globalTtlSeconds: 3600,
};

describe("Kho lưu trạng thái SMS", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetRedisClient.mockReturnValue({ eval: (...args: unknown[]) => mockEval(...args) });
  });

  it("đọc lại kết quả gốc khi SDK tự giải mã JSON từ Redis", async () => {
    mockEval.mockResolvedValue(["REPLAY", {
      challenge_id: "challenge-original", phone_digest: "phone-digest", session_scope: "session-scope",
      dispatch_state: "final", outcome: { data },
    }]);
    expect(await reserveSmsTestSend(input)).toEqual({ kind: "replay", outcome: { data } });
  });

  it("chỉ trả trạng thái chưa rõ khi lần gửi đầu còn đang chạy", async () => {
    mockEval.mockResolvedValue(["REPLAY", {
      challenge_id: "challenge-original", phone_digest: "phone-digest", session_scope: "session-scope",
      dispatch_state: "in_flight", outcome: { data },
    }]);
    expect(await reserveSmsTestSend(input)).toEqual({ kind: "replay", outcome: { data: {
      ...data, delivery_status: "unknown", provider_code: null, sms_per_message: null,
    } } });
  });

  it("chặn gửi khi Redis không có hoặc trả kết quả bất thường", async () => {
    mockGetRedisClient.mockReturnValueOnce(null);
    await expect(reserveSmsTestSend(input)).rejects.toBeInstanceOf(SmsTestStoreUnavailable);
    mockEval.mockResolvedValueOnce(null);
    await expect(reserveSmsTestSend(input)).rejects.toBeInstanceOf(SmsTestStoreUnavailable);
  });
});
