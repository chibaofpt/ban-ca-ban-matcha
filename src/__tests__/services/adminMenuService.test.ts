import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPut = vi.fn();

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { put: (...args: unknown[]) => mockPut(...args) },
}));

import { reorderAdminMenu, toggleMenuItemAvailability, updateMenuItem } from "@/src/services/adminMenuService";

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

describe("adminMenuService thay bột Fusion", () => {
  beforeEach(() => vi.clearAllMocks());
  const details = { reason: "FUSION_POWDER_REPLACEMENT_REQUIRED", powder_id: "powder-a", fusion_items: [{ id: "fusion-1", name: "Fusion", is_available: false, default_powder_id: "powder-a", replacement_powder_id: null }], available_powders: [{ id: "powder-b", name: "B" }] };
  it("gửi mapping qua cùng PUT và unwrap món đã lưu", async () => {
    const mappings = [{ menu_item_id: "fusion-1", replacement_powder_id: "powder-b" }];
    const saved = { id: "latte-a", is_available: false };
    mockPut.mockResolvedValue({ data: { data: saved } });
    await expect(toggleMenuItemAvailability("latte-a", false, mappings)).resolves.toEqual(saved);
    expect(mockPut).toHaveBeenCalledWith("/api/admin/menu/latte-a", { is_available: false, fusion_powder_replacements: mappings });
  });
  it("giữ lỗi 422 và chi tiết thay bột cho toggle Latte", async () => {
    mockPut.mockRejectedValue({ isAxiosError: true, response: { status: 422, data: { error: "Chọn bột thay thế", code: "BUSINESS_RULE_VIOLATION", details } } });
    await expect(toggleMenuItemAvailability("latte-a", false)).rejects.toMatchObject({ message: "Chọn bột thay thế", status: 422, code: "BUSINESS_RULE_VIOLATION", details });
  });
  it("giữ FormData và lỗi 422 cho lưu đầy đủ", async () => {
    const form = new FormData(); form.set("is_available", "false"); form.set("image_filename", "matcha");
    mockPut.mockRejectedValue({ isAxiosError: true, response: { status: 422, data: { error: "Chọn bột thay thế", code: "BUSINESS_RULE_VIOLATION", details } } });
    await expect(updateMenuItem("latte-a", form)).rejects.toMatchObject({ status: 422, details });
    expect(mockPut).toHaveBeenCalledWith("/api/admin/menu/latte-a", form);
  });
});
