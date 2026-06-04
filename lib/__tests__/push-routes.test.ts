/**
 * Unit tests for push notification API routes:
 *   POST /api/push/subscribe
 *   POST /api/push/unsubscribe
 *   POST /api/push/test
 *
 * Strategy: mock lib/prisma, lib/auth, lib/push.
 * Tests verify auth guards, validation, and DB upsert/update behavior.
 * All tests FAIL until API routes are implemented (TDD).
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
const mockPushSubFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      upsert: (...args: unknown[]) => mockPushSubUpsert(...args),
      updateMany: (...args: unknown[]) => mockPushSubUpdateMany(...args),
      findMany: (...args: unknown[]) => mockPushSubFindMany(...args),
    },
  },
}));

const mockSendPushToRoles = vi.fn();
const mockSendPushToUser = vi.fn();

vi.mock("@/lib/push", () => ({
  sendPushToRoles: (...args: unknown[]) => mockSendPushToRoles(...args),
  sendPushToUser: (...args: unknown[]) => mockSendPushToUser(...args),
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import { POST as subscribePost } from "@/app/api/push/subscribe/route";
import { POST as unsubscribePost } from "@/app/api/push/unsubscribe/route";
import { POST as testPost } from "@/app/api/push/test/route";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = "550e8400-e29b-41d4-a716-446655440001";
const STAFF_ID = "550e8400-e29b-41d4-a716-446655440002";

const adminSession = { id: ADMIN_ID, role: "ADMIN" };
const staffSession = { id: STAFF_ID, role: "STAFF" };
const customerSession = { id: "cust-1", role: "CUSTOMER" };

const validSubscribeBody = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: {
    p256dh: "BNSAr9GqsZKxLnO8Aopf2hSZCyHjiqhNqNHKr9hN1234567890abcdef",
    auth: "auth-secret-string",
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

describe("POST /api/push/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
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
      makeReq("/api/push/unsubscribe", { endpoint: "https://non-existent-endpoint.com" })
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

// ── POST /api/push/test ───────────────────────────────────────────────────────

describe("POST /api/push/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockSendPushToUser.mockResolvedValue(2); // 2 subscriptions sent
  });

  it("gửi push chỉ cho chính user đang login — không gửi cho người khác", async () => {
    const res = await testPost(makeReq("/api/push/test", {}));

    expect(res.status).toBe(200);
    // Phải gọi sendPushToUser với chính session.id
    expect(mockSendPushToUser).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.objectContaining({ title: expect.any(String) })
    );
    // Không được gọi sendPushToRoles (sẽ gửi cho người khác)
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });

  it("trả { data: { sent: N } } với N = số subscriptions đã gửi", async () => {
    mockSendPushToUser.mockResolvedValue(2);

    const res = await testPost(makeReq("/api/push/test", {}));

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { sent: number } };
    expect(json.data.sent).toBe(2);
  });

  it("trả { sent: 0 } khi user chưa có subscription nào", async () => {
    mockSendPushToUser.mockResolvedValue(0);

    const res = await testPost(makeReq("/api/push/test", {}));

    const json = await res.json() as { data: { sent: number } };
    expect(json.data.sent).toBe(0);
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await testPost(makeReq("/api/push/test", {}));

    expect(res.status).toBe(401);
  });

  it("trả 403 khi role là CUSTOMER", async () => {
    mockGetSession.mockResolvedValue(customerSession);

    const res = await testPost(makeReq("/api/push/test", {}));

    expect(res.status).toBe(403);
  });
});
