import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  getSession: vi.fn(),
  signJwt: vi.fn(),
  setAuthCookies: vi.fn(),
  checkRateLimits: vi.fn(),
  getClientIp: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: boundary.getSession,
  signJwt: boundary.signJwt,
  setAuthCookies: boundary.setAuthCookies,
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimits: boundary.checkRateLimits,
  getClientIp: boundary.getClientIp,
}));
vi.mock("@/lib/changePassword", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/changePassword")>();
  return { ...actual, changePassword: boundary.changePassword };
});

import { PATCH } from "@/app/api/profile/password/route";
import {
  ChangePasswordConflictError,
  CurrentPasswordMismatchError,
  PasswordReuseError,
} from "@/lib/changePassword";

const CUSTOMER_SESSION = {
  id: "user-1",
  role: "CUSTOMER",
  phone_number: "+84912345678",
  session_id: "session-1",
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/profile/password", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/profile/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.getSession.mockResolvedValue(CUSTOMER_SESSION);
    boundary.getClientIp.mockReturnValue("203.0.113.8");
    boundary.checkRateLimits.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
    boundary.changePassword.mockResolvedValue({
      refreshToken: "550e8400-e29b-41d4-a716-446655440009",
      revokedRefreshTokens: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    boundary.signJwt.mockResolvedValue("new-access-token");
    boundary.setAuthCookies.mockResolvedValue(undefined);
  });

  it("authenticates and authorizes before parsing the body", async () => {
    boundary.getSession.mockResolvedValueOnce(null);
    const unauthenticated = await PATCH(request({ invalid: true }));
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({ code: "UNAUTHORIZED" });

    boundary.getSession.mockResolvedValueOnce({ ...CUSTOMER_SESSION, role: "STAFF" });
    const forbidden = await PATCH(request({ invalid: true }));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(boundary.checkRateLimits).not.toHaveBeenCalled();
    expect(boundary.changePassword).not.toHaveBeenCalled();
  });

  it("returns field-level validation errors and does not consume the account limit", async () => {
    const response = await PATCH(request({ current_password: "short", new_password: "short" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: expect.any(String) },
    });
    expect(boundary.checkRateLimits).not.toHaveBeenCalled();
  });

  it("rejects unknown fields before consuming a limiter or starting the workflow", async () => {
    const response = await PATCH(request({
      current_password: "current1",
      new_password: "newpass1",
      extra: "not-allowed",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: "current_password" },
    });
    expect(boundary.checkRateLimits).not.toHaveBeenCalled();
    expect(boundary.changePassword).not.toHaveBeenCalled();
  });

  it("checks both IP/account buckets and maps the aggregate Retry-After", async () => {
    boundary.checkRateLimits.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 321 });

    const response = await PATCH(request({ current_password: "current1", new_password: "newpass1" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("321");
    expect(await response.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(boundary.checkRateLimits).toHaveBeenCalledWith([
      { ruleName: "authMutationIp", identifier: "203.0.113.8" },
      { ruleName: "passwordChangeAccount", identifier: "user-1" },
    ]);
    expect(boundary.changePassword).not.toHaveBeenCalled();
  });

  it("maps workflow failures without exposing secrets", async () => {
    const cases = [
      [new CurrentPasswordMismatchError(), 400, "current_password"],
      [new PasswordReuseError(), 400, "new_password"],
      [new ChangePasswordConflictError(), 409, undefined],
    ] as const;

    for (const [error, status, field] of cases) {
      boundary.changePassword.mockRejectedValueOnce(error);
      const response = await PATCH(request({ current_password: "current1", new_password: "newpass1" }));
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("current1");
      if (field) expect(body.details.field).toBe(field);
    }
  });

  it("rotates the current access and refresh cookies after commit", async () => {
    const response = await PATCH(request({ current_password: "current1", new_password: "newpass1" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true } });
    expect(boundary.changePassword).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "newpass1",
    });
    expect(boundary.checkRateLimits).toHaveBeenCalledWith([
      { ruleName: "authMutationIp", identifier: "203.0.113.8" },
      { ruleName: "passwordChangeAccount", identifier: "user-1" },
    ]);
    expect(boundary.signJwt).toHaveBeenCalledWith({
      id: "user-1",
      role: "CUSTOMER",
      phone_number: "+84912345678",
      sid: "session-1",
    });
    expect(boundary.setAuthCookies).toHaveBeenCalledWith(
      "new-access-token",
      "550e8400-e29b-41d4-a716-446655440009",
      "CUSTOMER",
    );
  });

  it("maps unexpected workflow errors to a generic internal error", async () => {
    boundary.changePassword.mockRejectedValue(new Error("password=secret-value"));

    const response = await PATCH(request({ current_password: "current1", new_password: "newpass1" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: expect.any(String), code: "INTERNAL_ERROR" });
    expect(JSON.stringify(body)).not.toContain("secret-value");
  });
});
