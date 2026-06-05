/**
 * Unit tests for src/services/pushService.ts
 *
 * Strategy: mock apiClient and browser APIs (serviceWorker, PushManager, Notification).
 * Tests verify correct API calls and silent failure behavior.
 * All tests FAIL until pushService.ts is implemented (TDD).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks declared before imports ────────────────────────────────────────────

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

// ── Browser API mocks ─────────────────────────────────────────────────────────

const mockSubscribe = vi.fn();
const mockGetSubscription = vi.fn();
const mockUnsubscribe = vi.fn();
const mockRegister = vi.fn();

const mockPushManager = {
  subscribe: (...args: unknown[]) => mockSubscribe(...args),
  getSubscription: () => mockGetSubscription(),
};

const mockRegistration = {
  pushManager: mockPushManager,
};

// Mock navigator.serviceWorker
Object.defineProperty(global, "navigator", {
  value: {
    serviceWorker: {
      register: (...args: unknown[]) => mockRegister(...args),
      ready: Promise.resolve(mockRegistration),
    },
  },
  writable: true,
});

const mockRequestPermission = vi.fn().mockResolvedValue("granted");

const mockNotification = {
  permission: "granted",
  requestPermission: mockRequestPermission,
};

// Mock Notification
Object.defineProperty(global, "Notification", {
  value: mockNotification,
  writable: true,
});

// Mock window.PushManager and window.Notification
Object.defineProperty(global, "window", {
  value: { 
    PushManager: {},
    Notification: mockNotification
  },
  writable: true,
});

// Mock atob
global.window.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import {
  subscribeToPush,
  unsubscribeFromPush,
  checkAndResubscribe,
  sendTestPush,
} from "@/src/services/pushService";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = "BFakeVapidPublicKey1234567890abcdefghijk";

const mockPushSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  toJSON: () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
    keys: {
      p256dh: "BNSAr9GqsZKxLnO8Aopf2hS12345",
      auth: "auth-secret",
    },
  }),
  unsubscribe: () => mockUnsubscribe(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("subscribeToPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;
    mockRegister.mockResolvedValue(mockRegistration);
    mockSubscribe.mockResolvedValue(mockPushSubscription);
    mockPost.mockResolvedValue({ data: { data: { subscribed: true } } });
  });

  it("gọi POST /api/push/subscribe với đúng endpoint và keys", async () => {
    await subscribeToPush();

    expect(mockPost).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({
        endpoint: mockPushSubscription.endpoint,
        keys: expect.objectContaining({
          p256dh: expect.any(String),
          auth: expect.any(String),
        }),
      })
    );
  });

  it("register service worker với '/sw.js'", async () => {
    await subscribeToPush();

    expect(mockRegister).toHaveBeenCalledWith("/sw.js");
  });

  it("subscribe với userVisibleOnly: true và VAPID public key", async () => {
    await subscribeToPush();

    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      })
    );
  });

  it("throw error khi API trả lỗi", async () => {
    mockPost.mockRejectedValue(new Error("Unauthorized"));

    await expect(subscribeToPush()).rejects.toThrow();
  });
});

describe("unsubscribeFromPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockResolvedValue(mockPushSubscription);
    mockUnsubscribe.mockResolvedValue(true);
    mockPost.mockResolvedValue({ data: { data: { unsubscribed: true } } });
  });

  it("gọi POST /api/push/unsubscribe với endpoint", async () => {
    await unsubscribeFromPush();

    expect(mockPost).toHaveBeenCalledWith(
      "/api/push/unsubscribe",
      expect.objectContaining({
        endpoint: mockPushSubscription.endpoint,
      })
    );
  });

  it("gọi subscription.unsubscribe() trên browser", async () => {
    await unsubscribeFromPush();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("không throw khi không có subscription hiện tại", async () => {
    mockGetSubscription.mockResolvedValue(null);

    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
  });
});

describe("checkAndResubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;
    mockPost.mockResolvedValue({ data: { data: { subscribed: true } } });
  });

  it("không throw dù có lỗi — silent, iOS reliability", async () => {
    // Giả sử serviceWorker.ready throw
    Object.defineProperty(global, "navigator", {
      value: {
        serviceWorker: {
          register: vi.fn(),
          ready: Promise.reject(new Error("SW not supported")),
        },
      },
      writable: true,
    });

    await expect(checkAndResubscribe()).resolves.toBe(false);
  });

  it("gọi subscribe lại khi subscription hiện tại đã mất (null)", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        serviceWorker: {
          register: mockRegister.mockResolvedValue(mockRegistration),
          ready: Promise.resolve(mockRegistration),
        },
      },
      writable: true,
    });

    // Subscription đã mất
    mockGetSubscription.mockResolvedValue(null);
    mockSubscribe.mockResolvedValue(mockPushSubscription);

    await checkAndResubscribe();

    // Phải gọi subscribe lại và POST lên server
    expect(mockPost).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ endpoint: mockPushSubscription.endpoint })
    );
  });

  it("không re-subscribe nếu subscription vẫn còn active", async () => {
    Object.defineProperty(global, "navigator", {
      value: {
        serviceWorker: {
          register: vi.fn(),
          ready: Promise.resolve(mockRegistration),
        },
      },
      writable: true,
    });

    // Subscription vẫn active
    mockGetSubscription.mockResolvedValue(mockPushSubscription);

    await checkAndResubscribe();

    // Nếu đã có rồi → upsert (để refresh), không unsubscribe rồi subscribe lại
    // Server tự xử lý upsert nếu endpoint trùng
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe("sendTestPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { data: { sent: 1 } } });
  });

  it("gọi POST /api/push/test", async () => {
    await sendTestPush();

    expect(mockPost).toHaveBeenCalledWith("/api/push/test", {});
  });

  it("trả về { sent: N } từ API", async () => {
    mockPost.mockResolvedValue({ data: { data: { sent: 2 } } });

    const result = await sendTestPush();

    expect(result).toEqual({ sent: 2 });
  });

  it("throw error khi API trả lỗi", async () => {
    mockPost.mockRejectedValue(new Error("Forbidden"));

    await expect(sendTestPush()).rejects.toThrow();
  });
});
