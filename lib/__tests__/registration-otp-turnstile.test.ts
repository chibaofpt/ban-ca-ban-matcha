import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRegistrationTurnstile } from "@/lib/auth/turnstile";
import { otpEnvironment } from "./registration-otp.fixtures";

const fetchMock = vi.fn();
describe("Turnstile cho đăng ký — APPLICATION_LOGIC", () => {
  beforeEach(() => { otpEnvironment(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("xác minh token và action đăng ký khi không có hostname env riêng", async () => {
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "registration_otp" })));
    expect(await verifyRegistrationTurnstile("valid-token", "203.0.113.1")).toBe("accepted");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body.get("response")).toBe("valid-token");
    expect(init.body.get("secret")).toBe("private-turnstile-test-key");
  });
  it.each([
    { success: false, "error-codes": ["invalid-input-response"] },
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, action: "registration_otp" },
    { success: true, hostname: "matcha.example", action: "login" },
    { success: false, "error-codes": ["internal-error", "invalid-input-response"] },
  ])("từ chối phản hồi token sai, replay hoặc sai phạm vi %j", async (body) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(verifyRegistrationTurnstile("token", "ip")).rejects.toMatchObject({ status: 403 });
  });
  it("token trống không tự chứng minh outage; Siteverify bình thường từ chối", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["missing-input-response"] })));
    await expect(verifyRegistrationTurnstile("", "ip")).rejects.toMatchObject({ status: 403 });
  });
  it.each(["network", "server", "internal", "empty-on-outage"])("chỉ fallback khi backend xác định outage %s", async (kind) => {
    if (kind === "network" || kind === "empty-on-outage") fetchMock.mockRejectedValue(new TypeError("network"));
    else fetchMock.mockResolvedValue(kind === "server" ? new Response("", { status: 503 })
      : new Response(JSON.stringify({ success: false, "error-codes": ["internal-error"] })));
    expect(await verifyRegistrationTurnstile(kind === "empty-on-outage" ? "" : "token", "ip")).toBe("outage");
  });
  it("nhận biết abort khi đọc response body là outage phía nhà cung cấp", async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.error(new DOMException("Timed out", "AbortError"));
    } })));
    expect(await verifyRegistrationTurnstile("token", "ip")).toBe("outage");
  });
  it.each(["malformed", "oversize", "nonjson"])("từ chối phản hồi sai dạng hoặc vượt giới hạn %s", async (kind) => {
    fetchMock.mockResolvedValue(new Response(kind === "oversize" ? "x".repeat(20000) : kind === "nonjson" ? "null" : "{"));
    await expect(verifyRegistrationTurnstile("token", "ip")).rejects.toMatchObject({ status: 403 });
  });
  it("chuyển secret server sai do nhà cung cấp báo thành lỗi cấu hình", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-secret"] })));
    await expect(verifyRegistrationTurnstile("token", "ip")).rejects.toMatchObject({ status: 503, reason: "TURNSTILE_CONFIG" });
  });
  it("từ chối cấu hình sai trước lời gọi bên ngoài", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    await expect(verifyRegistrationTurnstile("token", "ip")).rejects.toMatchObject({ status: 503, reason: "TURNSTILE_CONFIG" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
