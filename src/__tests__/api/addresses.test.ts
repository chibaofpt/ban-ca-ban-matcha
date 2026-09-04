import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/profile/addresses/route";
import { DELETE } from "@/app/api/profile/addresses/[id]/route";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import type { Address as PrismaAddress } from "@prisma/client";
import { goongDistanceMatrix } from "@/lib/goong";
import { checkRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/goong", () => ({
  getStoreLocation: vi.fn(() => ({ lat: 10.762622, lng: 106.660172 })),
  goongDistanceMatrix: vi.fn(async () => ({ distanceKm: 2.5, durationMinutes: 10 })),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimits: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.8"),
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
  const makeAddress = (overrides: Partial<PrismaAddress> = {}): PrismaAddress => ({
    id: "addr-1",
    user_id: mockUserId,
    label: "Nhà",
    full_address: "123 Test",
    lat: 10,
    lng: 106,
    receiver_name: "Test",
    receiver_phone: "+84901234567",
    is_default: false,
    distance_km: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      id: mockUserId,
      role: "CUSTOMER",
      phone_number: "+84901234567",
    });
    vi.mocked(checkRateLimits).mockResolvedValue({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
  });

  function createRequest(method: string, body?: unknown, url = "http://localhost/api/profile/addresses") {
    return new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe("GET /api/profile/addresses", () => {
    it("GET /api/profile/addresses: trả về danh sách của user", async () => {
      const mockAddresses = [makeAddress({ id: "1", is_default: true })];
      vi.mocked(prisma.address.findMany).mockResolvedValue(mockAddresses);

      const req = createRequest("GET");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toEqual(
        mockAddresses.map((address) => ({
          ...address,
          created_at: address.created_at.toISOString(),
          updated_at: address.updated_at.toISOString(),
        }))
      );
      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { user_id: mockUserId },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
      });
    });
  });

  describe("POST /api/profile/addresses", () => {
    it("từ chối label quá dài trước khi gọi Goong", async () => {
      const req = createRequest("POST", {
        label: "N".repeat(51),
        full_address: "123 Test",
        lat: 10,
        lng: 106,
        receiver_name: "Test",
        receiver_phone: "+84901234567",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(goongDistanceMatrix).not.toHaveBeenCalled();
    });
    it("dùng chung quota delivery account và IP trước khi gọi Goong", async () => {
      vi.mocked(checkRateLimits).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 17 });
      const req = createRequest("POST", {
        label: "Nhà", full_address: "123 Test", lat: 10, lng: 106,
        receiver_name: "Test", receiver_phone: "+84901234567",
      });
      const res = await POST(req);
      expect(res.status).toBe(429);
      expect(checkRateLimits).toHaveBeenCalledWith([
        { ruleName: "deliveryAccount", identifier: mockUserId },
        { ruleName: "deliveryIp", identifier: "203.0.113.8" },
      ]);
      expect(goongDistanceMatrix).not.toHaveBeenCalled();
    });
    it("POST /api/profile/addresses: quá 4 address -> báo lỗi MAX_ADDRESSES_REACHED", async () => {
      vi.mocked(prisma.address.count).mockResolvedValue(4);

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
      vi.mocked(prisma.address.count).mockResolvedValue(0);
      vi.mocked(prisma.address.create).mockResolvedValue(
        makeAddress({ id: "1", is_default: true })
      );

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
      vi.mocked(prisma.address.findUnique).mockResolvedValue(makeAddress({
        id: "addr-1",
        user_id: mockUserId,
        is_default: true,
      }));
      // Mock finding remaining addresses
      vi.mocked(prisma.address.findFirst).mockResolvedValue(
        makeAddress({ id: "addr-2", created_at: new Date() })
      );

      const req = createRequest("DELETE", undefined, "http://localhost/api/profile/addresses/addr-1");
      const res = await DELETE(req, { params: Promise.resolve({ id: "addr-1" }) });

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
