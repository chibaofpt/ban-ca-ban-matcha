import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/profile/addresses/route";
import { DELETE, PUT } from "@/app/api/profile/addresses/[id]/route";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const mockAddress = {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  };
  const mockPrismaInstance = {
    address: mockAddress,
    $transaction: vi.fn((cb) => cb(mockPrismaInstance)),
  };
  return {
    prisma: mockPrismaInstance,
  };
});

describe("Address CRUD API", () => {
  const mockUserId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    (getSession as any).mockResolvedValue({ id: mockUserId, role: "CUSTOMER" });
  });

  function createRequest(method: string, body?: any, url = "http://localhost/api/profile/addresses") {
    return new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe("GET /api/profile/addresses", () => {
    it("GET /api/profile/addresses: trả về danh sách của user", async () => {
      const mockAddresses = [{ id: "1", label: "Nhà", is_default: true }];
      (prisma.address.findMany as any).mockResolvedValue(mockAddresses);

      const req = createRequest("GET");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toEqual(mockAddresses);
      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { user_id: mockUserId },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
      });
    });
  });

  describe("POST /api/profile/addresses", () => {
    it("POST /api/profile/addresses: quá 4 address -> báo lỗi MAX_ADDRESSES_REACHED", async () => {
      (prisma.address.count as any).mockResolvedValue(4);

      const req = createRequest("POST", {
        label: "Cty",
        full_address: "123 Test",
        lat: 10,
        lng: 106,
        receiver_name: "Test",
        receiver_phone: "+84901234567",
        is_default: false,
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("MAX_ADDRESSES_REACHED");
    });

    it("POST /api/profile/addresses: address đầu tiên tự động thành default", async () => {
      (prisma.address.count as any).mockResolvedValue(0);
      (prisma.address.create as any).mockResolvedValue({ id: "1", is_default: true });

      const req = createRequest("POST", {
        label: "Cty",
        full_address: "123 Test",
        lat: 10,
        lng: 106,
        receiver_name: "Test",
        receiver_phone: "+84901234567",
        is_default: false, // client sends false
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_default: true }), // Server forces true
        })
      );
    });
  });

  describe("DELETE /api/profile/addresses/[id]", () => {
    it("DELETE /api/profile/addresses: xóa address default thì gán default cho address khác", async () => {
      // Mock existing address is default
      (prisma.address.findUnique as any).mockResolvedValue({
        id: "addr-1",
        user_id: mockUserId,
        is_default: true,
      });
      // Mock finding remaining addresses
      (prisma.address.findFirst as any).mockResolvedValue(
        { id: "addr-2", created_at: new Date() }
      );

      const req = createRequest("DELETE", undefined, "http://localhost/api/profile/addresses/addr-1");
      const res = await DELETE(req, { params: { id: "addr-1" } });

      expect(res.status).toBe(200);
      expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: "addr-1" } });
      // Verify it updated addr-2 to default
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: "addr-2" },
        data: { is_default: true },
      });
    });
  });
});
