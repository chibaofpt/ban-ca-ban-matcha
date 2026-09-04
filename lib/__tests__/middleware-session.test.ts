import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

vi.hoisted(() => {
  process.env.JWT_SECRET = "middleware-session-test-secret-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sessions.example.test";
  process.env.SUPABASE_SECRET_KEY = "test-only-secret";
});
vi.mock("@/lib/redis", () => ({ cacheDelete: vi.fn().mockResolvedValue(undefined) }));
import { resolveSessionFull, verifyAccessToken } from "@/lib/middlewareSession";
import type { SessionWithUser } from "@/lib/middleware-auth";

const now = new Date("2026-09-04T00:00:00Z");
const oldToken = "550e8400-e29b-41d4-a716-446655440001";
const newToken = "550e8400-e29b-41d4-a716-446655440002";
const secret = new TextEncoder().encode("middleware-session-test-secret-at-least-32-bytes");
const denied = { user: null, cookieUpdates: null };
const fetchBoundary = vi.fn<typeof fetch>();
const row = (patch: Partial<SessionWithUser> = {}): SessionWithUser => ({
  id: "session-1", user_id: "user-1", refresh_token: oldToken,
  previous_refresh_token: null, rotating_at: null, expires_at: "2026-09-05T00:00:00Z",
  user: { id: "user-1", role: "STAFF", phone_number: "+84912345678" }, ...patch,
});
const winner = (patch: Partial<SessionWithUser> = {}) => row({
  refresh_token: newToken, previous_refresh_token: oldToken, rotating_at: now.toISOString(), ...patch,
});
const rows = (value: SessionWithUser[]) => new Response(JSON.stringify(value));
function request(refresh = oldToken, access?: string) {
  const req = new NextRequest("https://matcha.example/profile");
  req.cookies.set("refresh_token", refresh);
  if (access) req.cookies.set("access_token", access);
  return req;
}
async function accessToken() {
  return new SignJWT({ id: "user-1", role: "ADMIN", phone_number: "+84900000000", sid: "session-1" })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(secret);
}

// APPLICATION_LOGIC: real JOSE and middleware policy; only HTTP, Redis and clock doubled.
describe("Middleware session — policy thật qua PostgREST giả lập", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    fetchBoundary.mockReset(); vi.stubGlobal("fetch", fetchBoundary);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("xoay token hiện hành, giữ sid và quyền hiện hành", async () => {
    fetchBoundary.mockResolvedValueOnce(rows([row()])).mockResolvedValueOnce(rows([winner()]))
      .mockResolvedValueOnce(rows([winner()]));
    const result = await resolveSessionFull(request());
    expect(result.user).toEqual(row().user);
    expect(result.cookieUpdates?.refreshToken).toBe(newToken);
    const jwt = await jwtVerify(result.cookieUpdates!.accessToken, secret);
    expect(jwt.payload).toMatchObject({ sid: "session-1", id: "user-1", role: "STAFF" });
    const [url, init] = fetchBoundary.mock.calls[1];
    expect(init?.method).toBe("PATCH");
    expect(new URL(String(url)).searchParams.get("id")).toBe("eq.session-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({ previous_refresh_token: oldToken });
    expect(fetchBoundary.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it.each([oldToken, newToken])("chấp nhận token trong grace đúng 30 giây: %s", async (token) => {
    const recent = winner({ rotating_at: "2026-09-03T23:59:30Z" });
    fetchBoundary.mockResolvedValueOnce(rows([recent])).mockResolvedValueOnce(rows([recent]));
    expect((await resolveSessionFull(request(token))).cookieUpdates?.refreshToken).toBe(newToken);
    expect(fetchBoundary.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it("từ chối token cũ ngoài grace", async () => {
    fetchBoundary.mockResolvedValueOnce(rows([winner({ rotating_at: "2026-09-03T23:59:29.999Z" })]));
    expect(await resolveSessionFull(request())).toEqual(denied);
  });

  it.each(["missing", "patch-error", "deleted-after-patch"])("fail closed khi %s", async (scenario) => {
    fetchBoundary.mockResolvedValueOnce(rows(scenario === "missing" ? [] : [row()]));
    if (scenario === "patch-error") fetchBoundary.mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (scenario === "deleted-after-patch") fetchBoundary.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([]));
    expect(await resolveSessionFull(request())).toEqual(denied);
    expect(fetchBoundary.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it.each([
    { id: "other-session" }, { user_id: "other-user" },
    { user: { id: "other-user", role: "ADMIN", phone_number: "+84912345678" } },
    { expires_at: now.toISOString() }, { rotating_at: "2026-09-04T00:00:01Z" },
  ])("không ký cookie khi winner sai binding hoặc expiry: %j", async (patch) => {
    fetchBoundary.mockResolvedValueOnce(rows([row()])).mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([winner(patch)]));
    expect(await resolveSessionFull(request())).toEqual(denied);
  });

  // SIMULATED_RACE_OUTCOME: controlled PATCH winner/loser, not real database concurrency.
  it("hai request với PATCH thắng/thua cùng nhận token winner", async () => {
    let reads = 0;
    let patches = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    fetchBoundary.mockImplementation(async (_url, init) => {
      if (init?.method === "PATCH") return rows(++patches === 1 ? [winner()] : []);
      if (++reads <= 2) {
        if (reads === 2) release();
        await bothRead;
        return rows([row()]);
      }
      return rows([winner()]);
    });
    const results = await Promise.all([resolveSessionFull(request()), resolveSessionFull(request())]);
    expect(results.map((result) => result.cookieUpdates?.refreshToken)).toEqual([newToken, newToken]);
    expect(results.map((result) => result.user?.role)).toEqual(["STAFF", "STAFF"]);
    expect(patches).toBe(2);
  });

  it("access JWT dùng quyền hiện hành và query ràng buộc sid/user/expiry", async () => {
    fetchBoundary.mockResolvedValueOnce(rows([row()]));
    expect(await verifyAccessToken(request(oldToken, await accessToken()))).toEqual(row().user);
    const query = new URL(String(fetchBoundary.mock.calls[0][0])).searchParams;
    expect(query.get("id")).toBe("eq.session-1");
    expect(query.get("user_id")).toBe("eq.user-1");
    expect(query.get("expires_at")).toBe("gt.2026-09-04T00:00:00.000Z");
  });

  it("access JWT không authenticate khi query live session trả rỗng", async () => {
    fetchBoundary.mockResolvedValueOnce(rows([]));
    expect(await verifyAccessToken(request(oldToken, await accessToken()))).toBeNull();
  });
});
