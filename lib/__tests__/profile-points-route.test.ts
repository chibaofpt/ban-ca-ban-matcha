import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockUserFindUnique = vi.fn();
const mockPointsLogFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    pointsLog: {
      findMany: (...args: unknown[]) => mockPointsLogFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { GET } from "@/app/api/profile/points/route";

function makeRequest(query = ""): Request {
  return new Request(`http://localhost/api/profile/points${query}`);
}

describe("GET /api/profile/points — grouped events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      id: "customer-id",
      role: "CUSTOMER",
      phone_number: "+84912345678",
    });
    mockUserFindUnique.mockReturnValue("user-query");
    mockPointsLogFindMany.mockReturnValue("logs-query");
    mockTransaction.mockResolvedValue([
      { points_balance: 42 },
      [
        {
          id: "log-1",
          delta: -20,
          reason: "voucher_purchase",
          order_id: null,
          created_at: new Date("2026-08-01T10:00:00.000Z"),
          order: null,
          voucher: { package: { name: "Matcha lớn miễn phí" } },
          staff: null,
        },
      ],
    ]);
  });

  it("trả contract events và meta theo event", async () => {
    const response = await GET(makeRequest("?page=1&limit=10") as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.points_balance).toBe(42);
    expect(body.data.events).toEqual([
      expect.objectContaining({
        reason: "voucher_purchase",
        total_delta: -20,
        voucher: { package_name: "Matcha lớn miễn phí" },
      }),
    ]);
    expect(body.data.meta).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it("không expose UUID nội bộ", async () => {
    const response = await GET(makeRequest() as never);
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("voucher_id");
    expect(serialized).not.toContain("performed_by");
    expect(serialized).not.toContain("customer-id");
  });

  it("trả 400 khi page hoặc limit không hợp lệ", async () => {
    const response = await GET(makeRequest("?page=abc&limit=0") as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(makeRequest() as never);

    expect(response.status).toBe(401);
  });

  it("trả 403 khi role không phải CUSTOMER", async () => {
    mockGetSession.mockResolvedValue({
      id: "staff-id",
      role: "STAFF",
      phone_number: "+84911111111",
    });

    const response = await GET(makeRequest() as never);

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("trả 404 khi user không tồn tại", async () => {
    mockTransaction.mockResolvedValue([null, []]);

    const response = await GET(makeRequest() as never);

    expect(response.status).toBe(404);
  });
});
