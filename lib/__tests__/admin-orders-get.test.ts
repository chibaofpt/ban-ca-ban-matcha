import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockOrderCount = vi.fn();
const mockOrderFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/publicIdentifiers", () => ({
  resolveStaffIdentifier: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      count: (...args: unknown[]) => mockOrderCount(...args),
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { GET } from "@/app/api/admin/orders/route";

describe("GET /api/admin/orders — tab All", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "admin-id", role: "ADMIN", name: "Admin" });
    mockOrderCount.mockResolvedValue(0);
    mockOrderFindMany.mockResolvedValue([]);
    mockTransaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
  });

  it("loại đơn đã huỷ, giữ thứ tự mới nhất và trả role người nhận", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/admin/orders?exclude_cancelled=true"),
    );

    expect(response.status).toBe(200);
    expect(mockOrderCount).toHaveBeenCalledWith({
      where: { status: { notIn: ["CANCELLED"] } },
    });
    expect(mockOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { notIn: ["CANCELLED"] } },
      orderBy: { created_at: "desc" },
      include: expect.objectContaining({
        handler: { select: { name: true, role: true } },
      }),
    }));
  });
});
