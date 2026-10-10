import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: mocks.findMany, findUnique: mocks.findUnique } } }));
import { GET } from "@/app/api/staff/users/route";
const row = { qr_token: "public-customer", name: "Bạn Cá", phone_number: "+84912345678", points_balance: 12 };

describe("Tìm khách staff — APPLICATION_LOGIC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ role: "STAFF" });
    mocks.findUnique.mockImplementation(async ({ where }: { where: { phone_number: string } }) => where.phone_number === row.phone_number ? { ...row, role: "CUSTOMER", sourceMerge: null } : null);
    mocks.findMany.mockImplementation(async ({ where }: { where: {
      OR?: Array<{ phone_number?: { endsWith?: string; startsWith?: string }; name?: { contains: string }; email?: { contains: string }; insta_name?: { contains: string } }>;
      name?: { contains: string };
    } }) => {
      const found = where.OR ? where.OR.some(({ phone_number, name }) => phone_number
        ? phone_number.endsWith !== undefined ? row.phone_number.endsWith(phone_number.endsWith) : row.phone_number.startsWith(phone_number.startsWith!)
        : name ? row.name.includes(name.contains) : false)
        : row.name.includes(where.name!.contains);
      return found ? [row] : [];
    });
  });
  it.each(["0912345678", "+84912345678", "84912345678", "091 234 5678", "0912", "+84912", "5678", "Bạn"])("tìm cùng khách với q=%s", async (q) => {
    const response = await GET(new NextRequest("http://localhost/api/staff/users?q=" + encodeURIComponent(q)));
    expect(response.status).toBe(200);
    expect((await response.json()).data.items).toEqual([row]);
  });
  it("legacy phone lookup nhận dạng nội địa", async () => {
    const response = await GET(new NextRequest("http://localhost/api/staff/users?phone=0912345678"));
    expect((await response.json()).data.items).toEqual([row]);
  });
  it.each([null, { role: "CUSTOMER" }])("giữ quyền truy cập: %s", async (session) => {
    mocks.session.mockResolvedValue(session);
    const response = await GET(new NextRequest("http://localhost/api/staff/users?q=0912"));
    expect(response.status).toBe(session ? 403 : 401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
