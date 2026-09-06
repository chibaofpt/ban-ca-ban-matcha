/**
 * Unit tests for push notification API routes:
 *   POST /api/push/subscribe
 *   POST /api/push/unsubscribe
 *
 * Strategy: mock lib/prisma, lib/auth, and the centralized limiter.
 * Tests verify auth guards, validation, and DB upsert/update behavior.
 * APPLICATION_LOGIC: route authorization and real push schema; no live push claim.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared before imports ────────────────────────────────────────────

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

const mockPushSubUpsert = vi.fn();
const mockPushSubUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      upsert: (...args: unknown[]) => mockPushSubUpsert(...args),
      updateMany: (...args: unknown[]) => mockPushSubUpdateMany(...args),
    },
  },
}));

const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import { POST as subscribePost } from "@/app/api/push/subscribe/route";
import { POST as unsubscribePost } from "@/app/api/push/unsubscribe/route";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = "550e8400-e29b-41d4-a716-446655440001";
const STAFF_ID = "550e8400-e29b-41d4-a716-446655440002";

const adminSession = { id: ADMIN_ID, role: "ADMIN" };
const staffSession = { id: STAFF_ID, role: "STAFF" };
const customerSession = { id: "cust-1", role: "CUSTOMER" };

const validSubscribeBody = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: {
    p256dh: Buffer.from(Uint8Array.from([4, ...new Array(64).fill(1)])).toString("base64url"),
    auth: Buffer.from(new Uint8Array(16).fill(2)).toString("base64url"),
  },
};

function makeReq(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/push/subscribe ──────────────────────────────────────────────────

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
    mockPushSubUpsert.mockResolvedValue({ id: "sub-1", ...validSubscribeBody });
  });

  it("upsert subscription thành công — trả 200 với { data: { subscribed: true } }", async () => {
    const res = await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { subscribed: boolean } };
    expect(json.data.subscribed).toBe(true);
  });

  it("gọi upsert với đúng user_id từ session (không phải từ body)", async () => {
    await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(mockPushSubUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id_endpoint: {
            user_id: ADMIN_ID,
            endpoint: validSubscribeBody.endpoint,
          },
        }),
        create: expect.objectContaining({
          user_id: ADMIN_ID,
          endpoint: validSubscribeBody.endpoint,
          p256dh: validSubscribeBody.keys.p256dh,
          auth: validSubscribeBody.keys.auth,
          is_active: true,
        }),
      })
    );
  });

  it("upsert idempotent — subscribe 2 lần cùng endpoint không lỗi", async () => {
    await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));
    await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(mockPushSubUpsert).toHaveBeenCalledTimes(2);
  });

  it("STAFF cũng được subscribe — trả 200", async () => {
    mockGetSession.mockResolvedValue(staffSession);

    const res = await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(res.status).toBe(200);
  });

  it("trả 429 với Retry-After khi tài khoản vượt 20 lần trong 10 phút", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 301 });

    const res = await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("301");
    expect(mockCheckRateLimit).toHaveBeenCalledWith("pushMutationAccount", ADMIN_ID);
    expect(mockPushSubUpsert).not.toHaveBeenCalled();
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(res.status).toBe(401);
    expect((await res.json() as { code: string }).code).toBe("UNAUTHORIZED");
  });

  it("trả 403 khi role là CUSTOMER", async () => {
    mockGetSession.mockResolvedValue(customerSession);

    const res = await subscribePost(makeReq("/api/push/subscribe", validSubscribeBody));

    expect(res.status).toBe(403);
    expect((await res.json() as { code: string }).code).toBe("FORBIDDEN");
  });

  it("trả 400 khi endpoint thiếu — VALIDATION_ERROR", async () => {
    const res = await subscribePost(
      makeReq("/api/push/subscribe", { keys: validSubscribeBody.keys })
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi keys.p256dh thiếu — VALIDATION_ERROR", async () => {
    const res = await subscribePost(
      makeReq("/api/push/subscribe", {
        endpoint: validSubscribeBody.endpoint,
        keys: { auth: "only-auth" },
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("VALIDATION_ERROR");
  });
});
// ── POST /api/push/unsubscribe ────────────────────────────────────────────────

describe("Bảo mật push subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
  });

  it("từ chối endpoint giả hostname dù cả hai khóa hợp lệ", async () => {
    const res = await subscribePost(makeReq("/api/push/subscribe", {
      ...validSubscribeBody,
      endpoint: "https://fcm.googleapis.com.evil.example/push",
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockPushSubUpsert).not.toHaveBeenCalled();
  });

  it.each([
    { auth: "c2hvcnQ" },
    { auth: "a".repeat(23) },
    { auth: "!".repeat(22) },
    { p256dh: "BA" },
    { p256dh: "a".repeat(88) },
    { p256dh: Buffer.from(new Uint8Array(65).fill(2)).toString("base64url") },
  ])("từ chối khóa sai trên hostname hợp lệ: %j", async (keys) => {
    const res = await subscribePost(makeReq("/api/push/subscribe", {
      ...validSubscribeBody, keys: { ...validSubscribeBody.keys, ...keys },
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockPushSubUpsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/push/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
    mockPushSubUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("set is_active = false cho đúng subscription — trả 200", async () => {
    const res = await unsubscribePost(
      makeReq("/api/push/unsubscribe", { endpoint: validSubscribeBody.endpoint })
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { unsubscribed: boolean } };
    expect(json.data.unsubscribed).toBe(true);
  });

  it("gọi updateMany với user_id từ session và endpoint từ body", async () => {
    await unsubscribePost(
      makeReq("/api/push/unsubscribe", { endpoint: validSubscribeBody.endpoint })
    );

    expect(mockPushSubUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: ADMIN_ID,
          endpoint: validSubscribeBody.endpoint,
        },
        data: { is_active: false },
      })
    );
  });

  it("không lỗi khi subscription không tồn tại — idempotent", async () => {
    mockPushSubUpdateMany.mockResolvedValue({ count: 0 });

    const res = await unsubscribePost(
      makeReq("/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/non-existent" })
    );

    expect(res.status).toBe(200);
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await unsubscribePost(
      makeReq("/api/push/unsubscribe", { endpoint: validSubscribeBody.endpoint })
    );

    expect(res.status).toBe(401);
  });

  it("trả 403 khi role là CUSTOMER", async () => {
    mockGetSession.mockResolvedValue(customerSession);

    const res = await unsubscribePost(
      makeReq("/api/push/unsubscribe", { endpoint: validSubscribeBody.endpoint })
    );

    expect(res.status).toBe(403);
  });
});
