import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  evictSessionCache: vi.fn(),
  findSessionWithUser: vi.fn(),
  markSessionRotating: vi.fn(),
  updateSessionGracePeriod: vi.fn(),
}));

vi.hoisted(() => {
  process.env.JWT_SECRET = "middleware-session-test-secret-at-least-32-bytes";
});

vi.mock("@/lib/middleware-auth", () => mocks);

import { resolveSessionFull } from "@/lib/middlewareSession";

const session = {
  id: "session-1",
  user_id: "user-1",
  refresh_token: "refresh-1",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  user: { id: "user-1", role: "CUSTOMER", phone_number: "+84912345678" },
};

function makeRequest(): NextRequest {
  const request = new NextRequest("http://localhost/profile");
  request.cookies.set("refresh_token", "refresh-1");
  return request;
}

describe("resolveSessionFull — thu hồi refresh session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSessionWithUser.mockResolvedValue(session);
    mocks.markSessionRotating.mockResolvedValue("acquired");
    mocks.evictSessionCache.mockResolvedValue(undefined);
    mocks.updateSessionGracePeriod.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue({
      refresh_token: "refresh-2",
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    });
  });

  it("không authenticate khi DB không còn refresh session", async () => {
    mocks.findSessionWithUser.mockResolvedValueOnce(null);

    await expect(resolveSessionFull(makeRequest())).resolves.toEqual({
      user: null,
      cookieUpdates: null,
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("không authenticate khi không claim được rotation lock", async () => {
    mocks.markSessionRotating.mockResolvedValueOnce("error");

    await expect(resolveSessionFull(makeRequest())).resolves.toEqual({
      user: null,
      cookieUpdates: null,
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("không tạo session mới khi grace update không còn row", async () => {
    mocks.updateSessionGracePeriod.mockResolvedValueOnce(false);

    await expect(resolveSessionFull(makeRequest())).resolves.toEqual({
      user: null,
      cookieUpdates: null,
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
