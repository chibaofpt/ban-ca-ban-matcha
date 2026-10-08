import { beforeEach, describe, expect, it, vi } from "vitest";
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/src/lib/api/client", () => ({ apiClient: { put: (...args: unknown[]) => mockPut(...args), delete: (...args: unknown[]) => mockDelete(...args) } }));
import { deletePowder, togglePowderAvailability, updatePowder } from "@/src/services/adminPowderService";
describe("adminPowderService thay bột Fusion", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gửi mapping cho toggle và unwrap bột đã lưu", async () => {
    const mappings = [{ menu_item_id: "fusion-1", replacement_powder_id: "powder-b" }];
    const saved = { id: "powder-a", is_available: false };
    mockPut.mockResolvedValue({ data: { data: saved } });
    await expect(togglePowderAvailability("powder-a", false, mappings)).resolves.toEqual(saved);
    expect(mockPut).toHaveBeenCalledWith("/api/admin/powders/powder-a", { is_available: false, fusion_powder_replacements: mappings });
  });
  it("gửi mapping trong multipart cùng nội dung và tên ảnh", async () => {
    const mappings = [{ menu_item_id: "fusion-1", replacement_powder_id: "powder-b" }];
    const payload = { name: "A", manufacturer: "Kyoto", type: "NONE" as const, price_per_gram: 6000, is_available: false, fusion_powder_replacements: mappings };
    const saved = { id: "powder-a", is_available: false };
    mockPut.mockResolvedValue({ data: { data: saved } });
    await expect(updatePowder("powder-a", payload, null, "matcha-a")).resolves.toEqual(saved);
    const [url, form] = mockPut.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/admin/powders/powder-a");
    expect(JSON.parse(String(form.get("payload")))).toEqual(payload);
    expect(form.get("image_filename")).toBe("matcha-a");
  });
  it("giữ status, code, details lỗi yêu cầu thay bột", async () => {
    const details = { reason: "FUSION_POWDER_REPLACEMENT_REQUIRED", powder_id: "powder-a", fusion_items: [], available_powders: [] };
    mockPut.mockRejectedValue({ isAxiosError: true, response: { status: 422, data: { error: "Chọn bột thay thế", code: "BUSINESS_RULE_VIOLATION", details } } });
    await expect(togglePowderAvailability("powder-a", false)).rejects.toMatchObject({ message: "Chọn bột thay thế", status: 422, code: "BUSINESS_RULE_VIOLATION", details });
  });
  it("lưu bột qua multipart giữ dữ liệu ảnh và lỗi 422", async () => {
    const details = { reason: "FUSION_POWDER_REPLACEMENT_REQUIRED" };
    mockPut.mockRejectedValue({ isAxiosError: true, response: { status: 422, data: { error: "Chọn bột thay thế", code: "BUSINESS_RULE_VIOLATION", details } } });
    await expect(updatePowder("powder-a", { name: "A", manufacturer: "Kyoto", type: "NONE", price_per_gram: 6000, is_available: false })).rejects.toMatchObject({ status: 422, details });
    const [url, form] = mockPut.mock.calls[0] as [string, FormData];
    expect(url).toBe("/api/admin/powders/powder-a");
    expect(JSON.parse(String(form.get("payload")))).toEqual({ name: "A", manufacturer: "Kyoto", type: "NONE", price_per_gram: 6000, is_available: false });
  });
});

describe("adminPowderService ngưng bột qua DELETE", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gửi mapping trong DELETE data và unwrap response", async () => {
    const mappings = [{ menu_item_id: "fusion-1", replacement_powder_id: "powder-b" }];
    const saved = { id: "powder-a", is_available: false };
    mockDelete.mockResolvedValue({ data: { data: saved } });
    await expect(deletePowder("powder-a", mappings)).resolves.toEqual(saved);
    expect(mockDelete).toHaveBeenCalledWith("/api/admin/powders/powder-a", { data: { fusion_powder_replacements: mappings } });
  });
  it("giữ status code và details của lỗi 422 để retry DELETE", async () => {
    const details = { reason: "FUSION_POWDER_REPLACEMENT_REQUIRED", powder_id: "powder-a", fusion_items: [{ id: "fusion-1", name: "Fusion", is_available: false, default_powder_id: "powder-a", replacement_powder_id: null }], available_powders: [{ id: "powder-b", name: "B" }] };
    mockDelete.mockRejectedValue({ isAxiosError: true, response: { status: 422, data: { error: "Chọn bột thay thế", code: "BUSINESS_RULE_VIOLATION", details } } });
    await expect(deletePowder("powder-a")).rejects.toMatchObject({ message: "Chọn bột thay thế", status: 422, code: "BUSINESS_RULE_VIOLATION", details });
  });
  it("giữ tương thích DELETE chỉ truyền ID", async () => {
    const saved = { id: "powder-a", is_available: false };
    mockDelete.mockResolvedValue({ data: { data: saved } });
    await expect(deletePowder("powder-a")).resolves.toEqual(saved);
    expect(mockDelete).toHaveBeenCalledWith("/api/admin/powders/powder-a");
  });
});
