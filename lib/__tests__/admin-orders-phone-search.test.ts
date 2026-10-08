import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: { findMany: mocks.findMany, count: mocks.count }, $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations) } }));
import { GET } from "@/app/api/admin/orders/route";

describe("Tìm đơn admin bằng điện thoại — APPLICATION_LOGIC", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ role: "ADMIN" }); mocks.findMany.mockResolvedValue([]); mocks.count.mockResolvedValue(0); });
  it.each(["0912345678", "0912", "091 234 5678"])("query canonical cho %s", async (search) => {
    const response = await GET(new NextRequest("http://localhost/api/admin/orders?search=" + encodeURIComponent(search)));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([expect.objectContaining({
        user: { OR: expect.arrayContaining([{ phone_number: { contains: search === "0912" ? "+84912" : "+84912345678" } }]) },
      })]) }),
    }));
  });
});
