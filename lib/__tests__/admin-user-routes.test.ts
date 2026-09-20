import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), listUsers: vi.fn(), getUser: vi.fn(), resetPassword: vi.fn(),
  giftPoints: vi.fn(), capture: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/adminUserQueries", () => ({ listAdminUsers: mocks.listUsers, getAdminUser: mocks.getUser }));
vi.mock("@/lib/adminUserWorkflow", () => ({
  AdminUserWorkflowError: class extends Error { constructor(public reason: string) { super(reason); } },
  resetAdminUserPassword: mocks.resetPassword, giftAdminUserPoints: mocks.giftPoints,
  setAdminUserBlocked: vi.fn(), setAdminUserVerified: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({ captureServerException: mocks.capture }));

import { GET as listUsers } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[userQrToken]/route";
import { POST as giftPoints } from "@/app/api/admin/users/[userQrToken]/points/route";
import { AdminUserWorkflowError } from "@/lib/adminUserWorkflow";

const token = "550e8400-e29b-41d4-a716-446655440000";

describe("Admin customer routes", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("authenticates before protected list work and distinguishes 401/403", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await listUsers(new NextRequest("http://localhost/api/admin/users"))).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ id: "staff", role: "STAFF" });
    expect((await listUsers(new NextRequest("http://localhost/api/admin/users"))).status).toBe(403);
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("rejects unknown query keys through the strict schema", async () => {
    mocks.session.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const response = await listUsers(new NextRequest("http://localhost/api/admin/users?page=1&extra=true"));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns the temporary password only for the reset response", async () => {
    mocks.session.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.resetPassword.mockResolvedValue("abcdefghijklmnop");
    const response = await PATCH(new NextRequest(`http://localhost/api/admin/users/${token}`, {
      method: "PATCH", body: JSON.stringify({ action: "reset_password" }),
    }), { params: Promise.resolve({ userQrToken: token }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true, temporary_password: "abcdefghijklmnop" } });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("maps ghost password reset to the frozen 409 conflict envelope", async () => {
    mocks.session.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.resetPassword.mockRejectedValue(new AdminUserWorkflowError("RESET_NOT_ALLOWED"));

    const response = await PATCH(new NextRequest(`http://localhost/api/admin/users/${token}`, {
      method: "PATCH", body: JSON.stringify({ action: "reset_password" }),
    }), { params: Promise.resolve({ userQrToken: token }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Password reset is not available for an unregistered customer",
      code: "CONFLICT",
      details: { reason: "RESET_NOT_ALLOWED" },
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("passes the public customer token, points and Admin ID to the real points route", async () => {
    mocks.session.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
    mocks.giftPoints.mockResolvedValue(72);

    const response = await giftPoints(new NextRequest(`http://localhost/api/admin/users/${token}/points`, {
      method: "POST", body: JSON.stringify({ points: 20 }),
    }), { params: Promise.resolve({ userQrToken: token }) });

    expect(mocks.giftPoints).toHaveBeenCalledWith(token, 20, "admin-id");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { points_balance: 72 } });
  });

  it("maps points balance overflow to the frozen 422 business-rule envelope", async () => {
    mocks.session.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
    mocks.giftPoints.mockRejectedValue(new AdminUserWorkflowError("BUSINESS_RULE_VIOLATION"));

    const response = await giftPoints(new NextRequest(`http://localhost/api/admin/users/${token}/points`, {
      method: "POST", body: JSON.stringify({ points: 1 }),
    }), { params: Promise.resolve({ userQrToken: token }) });

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("BUSINESS_RULE_VIOLATION");
  });
});
