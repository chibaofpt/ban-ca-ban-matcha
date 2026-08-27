import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findMany: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: mocks.findMany } },
}));

import { GET } from "@/app/api/admin/staff/route";

describe("GET /api/admin/staff", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only public qr_token identifiers", async () => {
    mocks.getSession.mockResolvedValue({ id: "internal-admin-id", role: "ADMIN" });
    mocks.findMany.mockResolvedValue([
      { qr_token: "staff-public-token", name: "Nhân viên", role: "STAFF" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { qr_token: true, name: true, role: true },
    }));
    expect(body.data).toEqual([{
      qr_token: "staff-public-token",
      id: "staff-public-token",
      name: "Nhân viên",
      role: "STAFF",
    }]);
    expect(JSON.stringify(body)).not.toContain("internal-admin-id");
  });
});
