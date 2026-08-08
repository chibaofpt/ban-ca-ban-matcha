/**
 * Unit tests for lib/middleware-auth.ts
 * Tests the Edge-compatible session refresh logic using Supabase PostgREST.
 * Strategy: mock global fetch — verify correct PostgREST calls and token rotation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// Patch global fetch before imports
vi.stubGlobal("fetch", mockFetch);

// Mock env vars
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

// ── Import AFTER mocks ────────────────────────────────────────────────────────

import {
  findSessionWithUser,
  deleteSession,
  createSession,
} from "@/lib/middleware-auth";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const MOCK_SESSION = {
  id: "session-uuid-123",
  user_id: "user-uuid-456",
  refresh_token: "refresh-token-abc",
  expires_at: FUTURE_DATE,
  user: {
    id: "user-uuid-456",
    role: "CUSTOMER",
    phone_number: "+84912345678",
  },
};

function makeSupabaseResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("middleware-auth — findSessionWithUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });

  it("trả về session kèm user khi refresh_token hợp lệ", async () => {
    mockFetch.mockResolvedValueOnce(
      makeSupabaseResponse([MOCK_SESSION])
    );

    const result = await findSessionWithUser("refresh-token-abc");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("session-uuid-123");
    expect(result?.user.role).toBe("CUSTOMER");
    expect(result?.user.phone_number).toBe("+84912345678");
  });

  it("gọi đúng endpoint PostgREST với apikey và Authorization headers", async () => {
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([MOCK_SESSION]));

    await findSessionWithUser("refresh-token-abc");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://test.supabase.co/rest/v1/sessions");
    expect(url).toContain("refresh_token=eq.refresh-token-abc");
    expect(url).toContain("select=");
    const headers = options.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("test-service-role-key");
    expect(headers["Authorization"]).toContain("Bearer test-service-role-key");
  });

  it("ưu tiên secret key mới khi cả hai key đều được cấu hình", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-key");
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([MOCK_SESSION]));

    await findSessionWithUser("refresh-token-secret-key");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("test-secret-key");
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("trả về null khi không tìm thấy session", async () => {
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([]));

    const result = await findSessionWithUser("invalid-token");

    expect(result).toBeNull();
  });

  it("trả về null khi fetch thất bại (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await findSessionWithUser("refresh-token-abc");

    expect(result).toBeNull();
  });

  it("trả về null khi Supabase trả về non-200 status", async () => {
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse({ message: "Error" }, 500));

    const result = await findSessionWithUser("refresh-token-abc");

    expect(result).toBeNull();
  });
});

describe("middleware-auth — deleteSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi DELETE request đến đúng endpoint với session id", async () => {
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([], 204));

    await deleteSession("session-uuid-123");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://test.supabase.co/rest/v1/sessions");
    expect(url).toContain("id=eq.session-uuid-123");
    expect(options.method).toBe("DELETE");
  });

  it("không throw khi fetch thất bại (fire-and-forget)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(deleteSession("session-uuid-123")).resolves.not.toThrow();
  });
});

describe("middleware-auth — createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tạo session mới và trả về refresh_token và expires_at", async () => {
    const newSession = {
      id: "new-session-uuid",
      user_id: "user-uuid-456",
      refresh_token: "new-refresh-token-xyz",
      expires_at: FUTURE_DATE,
    };
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([newSession], 201));

    const result = await createSession("user-uuid-456");

    expect(result.refresh_token).toBe("new-refresh-token-xyz");
    expect(result.expires_at).toBe(FUTURE_DATE);
  });

  it("gọi POST với body đúng (user_id và expires_at)", async () => {
    const newSession = {
      id: "new-session-uuid",
      user_id: "user-uuid-456",
      refresh_token: "new-refresh-token-xyz",
      expires_at: FUTURE_DATE,
    };
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([newSession], 201));

    await createSession("user-uuid-456");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://test.supabase.co/rest/v1/sessions");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.user_id).toBe("user-uuid-456");
    expect(body.expires_at).toBeDefined();
    expect(new Date(body.expires_at) > new Date()).toBe(true);
  });

  it("gửi Prefer: return=representation để PostgREST trả về row mới", async () => {
    const newSession = {
      id: "new-session-uuid",
      user_id: "user-uuid-456",
      refresh_token: "new-refresh-token-xyz",
      expires_at: FUTURE_DATE,
    };
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse([newSession], 201));

    await createSession("user-uuid-456");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["Prefer"]).toBe("return=representation");
  });

  it("throw khi Supabase trả về lỗi", async () => {
    mockFetch.mockResolvedValueOnce(makeSupabaseResponse({ message: "Error" }, 500));

    await expect(createSession("user-uuid-456")).rejects.toThrow();
  });
});
