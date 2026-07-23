import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/orders/route";
import { getSession } from "@/lib/auth";
import { goongDistanceMatrix } from "@/lib/goong";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/goong", () => ({
  goongDistanceMatrix: vi.fn(),
  getStoreLocation: vi.fn().mockReturnValue({ lat: 10, lng: 106 }),
}));
vi.mock("@/lib/storeSchedule", () => ({
  checkStoreOpen: vi.fn().mockResolvedValue({ is_open: true }),
  validatePickupTime: vi.fn().mockResolvedValue({ isValid: true }),
}));
vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    menuItemSize: { findMany: vi.fn() },
    address: { findUnique: vi.fn() },
    voucher: { findFirst: vi.fn() },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
    order: { create: vi.fn() },
  };
  return { prisma: mockPrisma, default: mockPrisma };
});

describe("POST /api/orders — DELIVERY flow", () => {
  const mockUserId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      id: mockUserId,
      role: "CUSTOMER",
      phone_number: "+84901234567",
    });
  });

  function createRequest(body: unknown) {
    return new NextRequest("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("Trả 400 nếu order_type = DELIVERY nhưng thiếu fields địa chỉ", async () => {
    const req = createRequest({
      order_type: "DELIVERY",
      items: [{ menu_item_id: "e4d3f350-0012-4015-8df9-2ed3cc404c01", size: "MEDIUM", quantity: 1, client_price_vnd: 50000 }],
      // missing address fields
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("Trả 400 DELIVERY_OUT_OF_RANGE nếu khoảng cách > 15km", async () => {
    vi.mocked(goongDistanceMatrix).mockResolvedValue({ distanceKm: 16, durationMinutes: 30 });

    const req = createRequest({
      order_type: "DELIVERY",
      items: [{ menu_item_id: "e4d3f350-0012-4015-8df9-2ed3cc404c01", size: "MEDIUM", quantity: 1, client_price_vnd: 50000 }],
      address_id: "e4d3f350-0012-4015-8df9-2ed3cc404c02",
      delivery_lat: 11,
      delivery_lng: 107,
      delivery_address: "Far away",
      delivery_receiver_name: "Test",
      delivery_receiver_phone: "+84901234567",
      client_shipping_fee_vnd: 0,
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("DELIVERY_OUT_OF_RANGE");
  });

  it("Trả 409 SHIPPING_FEE_CHANGED nếu client tính sai phí ship so với server", async () => {
    // 3km -> 2km(15k) + 1km(5.7k) = 20.7k -> 21k
    vi.mocked(goongDistanceMatrix).mockResolvedValue({ distanceKm: 3, durationMinutes: 10 });

    const req = createRequest({
      order_type: "DELIVERY",
      items: [{ menu_item_id: "e4d3f350-0012-4015-8df9-2ed3cc404c01", size: "MEDIUM", quantity: 1, client_price_vnd: 50000 }],
      address_id: "e4d3f350-0012-4015-8df9-2ed3cc404c02",
      delivery_lat: 11,
      delivery_lng: 107,
      delivery_address: "Test",
      delivery_receiver_name: "Test",
      delivery_receiver_phone: "+84901234567",
      client_shipping_fee_vnd: 15000, // Client thought it was 15k
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("SHIPPING_FEE_CHANGED");
  });
});
