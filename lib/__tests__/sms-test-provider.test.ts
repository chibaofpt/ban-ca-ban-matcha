import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAbenlaOtp } from "@/lib/sms/abenla";

describe("Bộ chuyển tiếp Abenla", () => {
  function configure(): void {
    vi.stubEnv("ABENLA_LOGIN_NAME", "account");
    vi.stubEnv("ABENLA_SIGN", "precomputed-signature");
    vi.stubEnv("ABENLA_SERVICE_TYPE_ID", "1");
    vi.stubEnv("ABENLA_BRAND_NAME", "Brand");
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("từ chối mã gửi thất bại thay vì báo trạng thái chưa rõ", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      Code: 204, Message: "Failed", SmsPerMessage: 0,
    })));

    await expect(sendAbenlaOtp("+84912345678", "123456", "guid", "Mã kiểm tra {otp}"))
      .rejects.toMatchObject({ providerCode: 204 });
  });

  it("gửi mẫu cố định và chỉ dùng số điện thoại, mã OTP tại trường cần thiết", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ Code: 203, Message: "Sent", SmsPerMessage: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendAbenlaOtp("+84912345678", "123456", "guid", "Mã kiểm tra {otp}"))
      .toEqual({ deliveryStatus: "accepted", providerCode: 203, smsPerMessage: 1 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.abenla.com/api/SendOTP");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      LoginName: "account", Sign: "precomputed-signature", ServiceTypeId: 1,
      PhoneNumber: "84912345678", Message: "Mã kiểm tra 123456", BrandName: "Brand",
      DetectCode: false, CallBack: false, SmsGuid: "guid",
    });
  });

  it("giữ trạng thái chưa rõ khi mạng lỗi sau lúc bắt đầu gửi", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await sendAbenlaOtp("+84912345678", "123456", "guid", "Mã kiểm tra {otp}"))
      .toEqual({ deliveryStatus: "unknown", providerCode: null, smsPerMessage: null });
  });
});
