import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/publicIdentifiers", () => ({ resolveStaffIdentifier: vi.fn() }));
vi.mock("@/lib/orderPublicDto", () => ({ toAdminOrderListItemDto: vi.fn((order) => order) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { GET } from "@/app/api/admin/orders/route";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

describe("GET /api/admin/orders — lọc thanh toán", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ id: "admin-1", role: "ADMIN", phone_number: "+84900000000" });
    vi.mocked(prisma.$transaction).mockResolvedValue([0, []]);
  });

  it("lọc đúng các đơn chuyển khoản", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/orders?payment_method=BANK_TRANSFER"));

    expect(response.status).toBe(200);
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { payment_method: "BANK_TRANSFER" },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { payment_method: "BANK_TRANSFER" },
    }));
  });

  it("từ chối phương thức thanh toán ngoài contract", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/orders?payment_method=CARD"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid payment method",
      code: "VALIDATION_ERROR",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
