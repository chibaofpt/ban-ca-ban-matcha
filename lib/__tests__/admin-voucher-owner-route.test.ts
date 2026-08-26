import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockUserFindMany = vi.fn();
const mockPackageFindUnique = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) }, voucherPackage: { findUnique: (...args: unknown[]) => mockPackageFindUnique(...args) } } }));

import { GET } from "@/app/api/admin/voucher-packages/[id]/owners/route";

const PACKAGE_ID = "550e8400-e29b-41d4-a716-446655440001";
const params = { params: Promise.resolve({ id: PACKAGE_ID }) };
const request = (query: string) => new NextRequest(`http://localhost/api/admin/voucher-packages/${PACKAGE_ID}/owners?${query}`);

describe("GET /api/admin/voucher-packages/[id]/owners", () => {
  beforeEach(() => { vi.clearAllMocks(); mockGetSession.mockResolvedValue({ id: "admin", role: "ADMIN" }); mockPackageFindUnique.mockResolvedValue({ id: PACKAGE_ID }); });

  it("trả 404 ổn định khi route id sai định dạng", async () => { const response = await GET(request("q=matcha"), { params: Promise.resolve({ id: "not-a-uuid" }) }); expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ code: "NOT_FOUND" }); expect(mockPackageFindUnique).not.toHaveBeenCalled(); });

  it("trả 404 khi package không tồn tại", async () => { mockPackageFindUnique.mockResolvedValue(null); const response = await GET(request("q=matcha"), params); expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ code: "NOT_FOUND" }); expect(mockUserFindMany).not.toHaveBeenCalled(); });

  it("trả 400 khi từ khoá ngắn hơn hai ký tự", async () => {
    const response = await GET(request("q=a"), params);
    expect(response.status).toBe(400);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("trả 401 khi chưa đăng nhập và 403 khi không phải ADMIN", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await GET(request("q=an"), params)).status).toBe(401);
    mockGetSession.mockResolvedValueOnce({ id: "staff", role: "STAFF" });
    expect((await GET(request("q=an"), params)).status).toBe(403);
  });

  it("tìm Instagram bỏ @ và chỉ trả public token với trạng thái hiệu lực", async () => {
    mockUserFindMany.mockResolvedValue([{ qr_token: "user-public", name: "An", insta_name: "matcha", phone_number: "+84901234567", vouchers: [{ qr_token: "voucher-public", status: "ACTIVE", issued_via: "FREE_CLAIM", created_at: new Date(), expires_at: new Date("2020-01-01"), redeemed_at: null, used_channel: null }] }]);
    const response = await GET(request("q=%40matcha&status=EXPIRED"), params);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(json)).not.toContain('"id"');
    expect(json.data.users[0].vouchers[0]).toMatchObject({ qr_token: "voucher-public", effective_status: "EXPIRED" });
    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ insta_name: { contains: "matcha", mode: "insensitive" } }]) }) }));
  });

  it("chuẩn hoá số 0/+84 và phân trang 20 người bằng public qr_token", async () => {
    mockUserFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ qr_token: `token-${String(index).padStart(2, "0")}`, name: `Khách ${index}`, insta_name: null, phone_number: "+84901234567", vouchers: [] })));
    const response = await GET(request("q=0901234567&status=ALL&cursor=previous"), params);
    const json = await response.json();
    expect(json.data.users).toHaveLength(20);
    expect(json.data.next_cursor).toBe("token-19");
    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21, where: expect.objectContaining({ qr_token: { gt: "previous" }, OR: expect.arrayContaining([{ phone_number: { contains: "+84901234567" } }]) }) }));
  });
});
