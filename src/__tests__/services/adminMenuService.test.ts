import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPut = vi.fn();

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { put: (...args: unknown[]) => mockPut(...args) },
}));

import { reorderAdminMenu } from "@/src/services/adminMenuService";

const payload = {
  groups: { latte: ["latte-b", "latte-a"], fusion: ["fusion-a"], extras: [] },
  baseline: [
    { id: "latte-a", category: "latte" as const, sort_order: 0, is_available: true },
    { id: "latte-b", category: "latte" as const, sort_order: 1, is_available: true },
    { id: "fusion-a", category: "fusion" as const, sort_order: 0, is_available: true },
  ],
};

describe("adminMenuService reorder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gửi toàn bộ snapshot đến endpoint reorder và unwrap kết quả", async () => {
    const result = { updated_at: "2026-09-08T00:00:00.000Z", groups: payload.groups };
    mockPut.mockResolvedValue({ data: { data: result } });

    await expect(reorderAdminMenu(payload)).resolves.toEqual(result);
    expect(mockPut).toHaveBeenCalledWith("/api/admin/menu/reorder", payload);
  });

  it("giữ nguyên metadata conflict để giao diện xử lý", async () => {
    mockPut.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: "Menu đã thay đổi, vui lòng tải lại",
          code: "CONFLICT",
          details: { reason: "MENU_CATALOG_CHANGED" },
        },
      },
    });

    await expect(reorderAdminMenu(payload)).rejects.toMatchObject({
      message: "Menu đã thay đổi, vui lòng tải lại",
      status: 409,
      code: "CONFLICT",
      details: { reason: "MENU_CATALOG_CHANGED" },
    });
  });
});
