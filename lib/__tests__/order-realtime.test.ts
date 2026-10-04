import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, jwtVerify } from "jose";

const mockAfter = vi.fn<(callback: () => Promise<void>) => void>();
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: (callback: () => Promise<void>) => mockAfter(callback),
}));
const mockSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockSession() }));

import { GET } from "@/app/api/realtime/orders/token/route";
import { publishOrderChange, scheduleOrderChange } from "@/lib/orderRealtime";

describe("Realtime đơn — quyền nhận và tín hiệu tối thiểu", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_REALTIME_SIGNING_JWK", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    mockSession.mockReset();
    mockAfter.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("cấp JWT 5 phút cho staff với session hiện hành và đúng audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = { ...await exportJWK(privateKey), kid: "test-key", alg: "ES256" };
    vi.stubEnv("SUPABASE_REALTIME_SIGNING_JWK", JSON.stringify(jwk));
    mockSession.mockResolvedValue({ id: "internal-user", role: "STAFF", session_id: "live-session" });
    const response = await GET();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const verified = await jwtVerify(data.token, publicKey, {
      algorithms: ["ES256"], issuer: "https://project.supabase.co/auth/v1", audience: "authenticated",
    });
    expect(verified.protectedHeader.kid).toBe("test-key");
    expect(verified.payload).toMatchObject({
      role: "authenticated", app_role: "STAFF", purpose: "order-realtime", sub: "live-session",
    });
    expect(verified.payload.exp! - verified.payload.iat!).toBe(300);
    expect(data).toMatchObject({ expires_at: verified.payload.exp, topic: "orders:operations", event: "orders_changed" });
    expect(verified.payload).not.toHaveProperty("id");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("gửi Broadcast riêng tư không có dữ liệu khách hoặc đơn", async () => {
    vi.stubEnv("SUPABASE_REALTIME_SIGNING_JWK", "configured");
    const externalHttp = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", externalHttp);
    await publishOrderChange();
    expect(externalHttp).toHaveBeenCalledWith(
      "https://project.supabase.co/realtime/v1/api/broadcast",
      expect.objectContaining({
        method: "POST",
        headers: { apikey: "sb_secret_test", "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{
          topic: "orders:operations", event: "orders_changed", payload: {}, private: true,
        }] }),
      }),
    );
  });

  it("trả 401 khi không có session và 503 khi chưa có cấu hình ký", async () => {
    mockSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    mockSession.mockResolvedValue({ id: "operator", role: "ADMIN", session_id: "session" });
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "Realtime unavailable", code: "SERVICE_UNAVAILABLE" });
    vi.stubEnv("SUPABASE_REALTIME_SIGNING_JWK", "invalid-secret-material");
    const invalid = await GET();
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toEqual({ error: "Realtime unavailable", code: "SERVICE_UNAVAILABLE" });
  });

  it("không phát khi chưa cấu hình và lỗi provider không làm hỏng order đã commit", async () => {
    const externalHttp = vi.fn().mockRejectedValue(new Error("private provider detail"));
    vi.stubGlobal("fetch", externalHttp);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await publishOrderChange();
    expect(externalHttp).not.toHaveBeenCalled();
    vi.stubEnv("SUPABASE_REALTIME_SIGNING_JWK", "configured");
    await expect(publishOrderChange()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[order-realtime] signal delivery failed");
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("private provider detail"));
    warn.mockRestore();
  });

  it("chỉ lên lịch khi bật và giữ HTTP đến sau response", async () => {
    const externalHttp = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", externalHttp);
    scheduleOrderChange();
    expect(mockAfter).not.toHaveBeenCalled();
    vi.stubEnv("SUPABASE_REALTIME_SIGNING_JWK", "configured");
    scheduleOrderChange();
    expect(mockAfter).toHaveBeenCalledWith(expect.any(Function));
    expect(externalHttp).not.toHaveBeenCalled();
    await mockAfter.mock.calls[0][0]();
    expect(externalHttp).toHaveBeenCalledWith(
      "https://project.supabase.co/realtime/v1/api/broadcast", expect.objectContaining({ method: "POST" }),
    );
  });

  it("từ chối khách hàng trước khi cấp token", async () => {
    mockSession.mockResolvedValue({ id: "customer", role: "CUSTOMER", session_id: "session" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

