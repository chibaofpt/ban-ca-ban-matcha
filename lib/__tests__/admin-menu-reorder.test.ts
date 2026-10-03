import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTransaction = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));
vi.mock("@/lib/cacheInvalidation", () => ({
  invalidateMenuCaches: () => mockInvalidate(),
}));

import { PUT } from "@/app/api/admin/menu/reorder/route";

const latteA = "11111111-1111-4111-8111-111111111111";
const latteB = "22222222-2222-4222-8222-222222222222";
const fusionA = "33333333-3333-4333-8333-333333333333";
const extraA = "44444444-4444-4444-8444-444444444444";

const stored = [
  { id: latteA, category: "latte", sort_order: 0, is_available: true },
  { id: latteB, category: "latte", sort_order: 1, is_available: false },
  { id: fusionA, category: "fusion", sort_order: 0, is_available: true },
  { id: extraA, category: "extras", sort_order: 0, is_available: true },
];

function request(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/admin/menu/reorder", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      groups: { latte: [latteB, latteA], fusion: [fusionA], extras: [extraA] },
      baseline: stored,
      ...overrides,
    }),
  });
}

describe("PUT /api/admin/menu/reorder", () => {
  const tx = { menuItem: { findMany: mockFindMany, update: mockUpdate } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ role: "ADMIN" });
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mockFindMany.mockResolvedValue(stored);
    mockUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { sort_order: number } }) => ({
      ...stored.find((item) => item.id === where.id),
      sort_order: data.sort_order,
      updated_at: new Date("2026-09-08T00:00:00.000Z"),
    }));
  });

  it("gán thứ tự liên tiếp trong từng danh mục và giữ cả món tạm ẩn", async () => {
    const response = await PUT(request());

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: latteB },
      data: expect.objectContaining({ sort_order: 0 }),
    }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: latteA },
      data: expect.objectContaining({ sort_order: 1 }),
    }));
    expect(mockUpdate).toHaveBeenCalledTimes(4);
    expect(mockInvalidate).toHaveBeenCalledOnce();
  });

  it("từ chối snapshot cũ mà không ghi đè thay đổi mới", async () => {
    mockFindMany.mockResolvedValue([
      ...stored.slice(0, 1),
      { ...stored[1], is_available: true },
      ...stored.slice(2),
    ]);

    const response = await PUT(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CONFLICT",
      details: { reason: "MENU_CATALOG_CHANGED" },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("từ chối id bị thiếu hoặc nằm sai danh mục", async () => {
    const response = await PUT(request({
      groups: { latte: [latteA], fusion: [fusionA, latteB], extras: [extraA] },
    }));

    expect(response.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("kiểm tra validation, đăng nhập và quyền admin trước khi ghi", async () => {
    const invalidResponse = await PUT(request({ groups: { latte: ["invalid"], fusion: [], extras: [] } }));
    expect(invalidResponse.status).toBe(400);

    mockGetSession.mockResolvedValueOnce(null);
    expect((await PUT(request())).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ role: "STAFF" });
    expect((await PUT(request())).status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("map lỗi serialization hết retry thành conflict có cấu trúc", async () => {
    mockTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }));

    const response = await PUT(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CONFLICT",
      details: { reason: "MENU_REORDER_CONFLICT" },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });
});
