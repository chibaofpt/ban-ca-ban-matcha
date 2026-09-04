/**
 * Unit tests for lib/push.ts — sendPushToRoles()
 *
 * Strategy: mock web-push, prisma, lib/auth.
 * Tests verify routing logic, exclusion, 410 cleanup, and silent failure.
 * All tests FAIL until lib/push.ts is implemented (TDD).
 */

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks declared before imports ────────────────────────────────────────────

const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

const mockPushSubscriptionFindMany = vi.fn();
const mockPushSubscriptionUpdateMany = vi.fn();
const mockPushSubscriptionUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: (...args: unknown[]) => mockPushSubscriptionFindMany(...args),
      updateMany: (...args: unknown[]) => mockPushSubscriptionUpdateMany(...args),
      upsert: (...args: unknown[]) => mockPushSubscriptionUpsert(...args),
    },
  },
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import { sendPushToRoles, sendPushToUser } from "@/lib/push";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID  = "550e8400-e29b-41d4-a716-446655440001";
const STAFF_ID  = "550e8400-e29b-41d4-a716-446655440002";
const STAFF2_ID = "550e8400-e29b-41d4-a716-446655440003";
const validP256dh = Buffer.from(Uint8Array.from([4, ...new Array(64).fill(1)])).toString("base64url");
const validAuth = Buffer.from(new Uint8Array(16).fill(2)).toString("base64url");

const adminSub = {
  id: "sub-admin-1",
  user_id: ADMIN_ID,
  endpoint: "https://fcm.googleapis.com/admin",
  p256dh: validP256dh,
  auth: validAuth,
  user: { role: "ADMIN" },
};

const staffSub = {
  id: "sub-staff-1",
  user_id: STAFF_ID,
  endpoint: "https://fcm.googleapis.com/staff",
  p256dh: validP256dh,
  auth: validAuth,
  user: { role: "STAFF" },
};

const staffSub2 = {
  id: "sub-staff-2",
  user_id: STAFF2_ID,
  endpoint: "https://fcm.googleapis.com/staff2",
  p256dh: validP256dh,
  auth: validAuth,
  user: { role: "STAFF" },
};

const testPayload = {
  title: "🔔 Đơn hàng mới!",
  body: "BCBM-A3X7K2 — 2 món — 125,000đ",
  url: "/admin/orders",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("sendPushToRoles — gửi push theo role", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.PUSH_DELIVERY_MODE;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "fake-public-key";
    process.env.VAPID_PRIVATE_KEY = "fake-private-key";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it("gửi đến tất cả subscriptions active của ADMIN", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([adminSub]);

    await sendPushToRoles(["ADMIN"], testPayload);

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: adminSub.endpoint, keys: { p256dh: adminSub.p256dh, auth: adminSub.auth } },
      expect.stringContaining(testPayload.title),
      { timeout: 5000 },
    );
  });

  it("gửi đến cả STAFF và ADMIN khi roles = ['STAFF', 'ADMIN']", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([adminSub, staffSub]);

    await sendPushToRoles(["STAFF", "ADMIN"], testPayload);

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("loại trừ excludeUserId khỏi danh sách nhận", async () => {
    // Admin vừa confirm payment → không nhận push
    mockPushSubscriptionFindMany.mockImplementation(({
      where,
    }: {
      where?: { user_id?: { not?: string } };
    }) => {
      if (where?.user_id?.not === ADMIN_ID) return Promise.resolve([staffSub]);
      return Promise.resolve([adminSub, staffSub]);
    });

    await sendPushToRoles(["STAFF", "ADMIN"], testPayload, ADMIN_ID);

    // Chỉ staff nhận được, admin bị loại
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: staffSub.endpoint }),
      expect.any(String),
      { timeout: 5000 },
    );
  });

  it("không gửi gì khi không có subscription nào active", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    await sendPushToRoles(["ADMIN"], testPayload);

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("không truy vấn subscription hoặc gọi web-push trong staging log-only", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    process.env.VERCEL_ENV = "preview";
    process.env.PUSH_DELIVERY_MODE = "log_only";

    await sendPushToRoles(["ADMIN"], testPayload);

    expect(mockPushSubscriptionFindMany).not.toHaveBeenCalled();
    expect(mockPushSubscriptionUpdateMany).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();

    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.PUSH_DELIVERY_MODE;
  });

  it("không suppress delivery khi VERCEL_ENV chưa được xác định", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    process.env.PUSH_DELIVERY_MODE = "log_only";
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    await sendPushToRoles(["ADMIN"], testPayload);

    expect(mockPushSubscriptionFindMany).toHaveBeenCalledTimes(1);
  });

  it("không suppress delivery khi production bị cấu hình nhầm log-only", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.PUSH_DELIVERY_MODE = "log_only";
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    await sendPushToRoles(["ADMIN"], testPayload);

    expect(mockPushSubscriptionFindMany).toHaveBeenCalledTimes(1);
  });

  it("sendPushToUser không truy vấn hoặc gửi trong staging preview log-only", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "staging";
    process.env.VERCEL_ENV = "preview";
    process.env.PUSH_DELIVERY_MODE = "log_only";

    await expect(sendPushToUser(ADMIN_ID, testPayload)).resolves.toBe(0);
    expect(mockPushSubscriptionFindMany).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("dùng Promise.allSettled — 1 subscription fail không chặn cái khác", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([staffSub, staffSub2]);

    // staffSub fail, staffSub2 success
    mockSendNotification
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ statusCode: 201 });

    // Không throw
    await expect(sendPushToRoles(["STAFF"], testPayload)).resolves.toBeUndefined();

    // Cả 2 đều được gọi
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("tự deactivate subscription khi APNs trả HTTP 410", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([adminSub]);

    const goneError = Object.assign(new Error("Gone"), { statusCode: 410 });
    mockSendNotification.mockRejectedValue(goneError);

    await sendPushToRoles(["ADMIN"], testPayload);

    // Phải set is_active = false cho subscription expired
    expect(mockPushSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [adminSub.id] } },
        data: { is_active: false },
      })
    );
  });

  it("không throw khi web-push ném lỗi — silent fire-and-forget", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([adminSub]);
    mockSendNotification.mockRejectedValue(new Error("APNs unavailable"));

    // Phải resolve bình thường, không throw
    await expect(sendPushToRoles(["ADMIN"], testPayload)).resolves.toBeUndefined();
  });

  it("payload gửi đúng title, body, url dạng JSON string", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([adminSub]);

    await sendPushToRoles(["ADMIN"], testPayload);

    const sentPayload = JSON.parse(mockSendNotification.mock.calls[0][1] as string) as {
      title: string;
      body: string;
      url: string;
    };
    expect(sentPayload.title).toBe(testPayload.title);
    expect(sentPayload.body).toBe(testPayload.body);
    expect(sentPayload.url).toBe(testPayload.url);
  });

  it("query chỉ lấy subscriptions is_active = true", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([]);

    await sendPushToRoles(["ADMIN"], testPayload);

    expect(mockPushSubscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        orderBy: { id: "asc" },
        where: expect.objectContaining({
          is_active: true,
        }),
      })
    );
  });
});

describe("Bảo mật khi gửi push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "fake-public-key";
    process.env.VAPID_PRIVATE_KEY = "fake-private-key";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
  });

  it("không kết nối endpoint legacy không hợp lệ và vô hiệu hóa subscription", async () => {
    mockPushSubscriptionFindMany.mockResolvedValue([
      { ...adminSub, endpoint: "https://fcm.googleapis.com.evil.example/push" },
    ]);
    await sendPushToRoles(["ADMIN"], testPayload);
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockPushSubscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [adminSub.id] } },
      data: { is_active: false },
    });
  });
});
