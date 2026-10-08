import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMenuItemRecord } from "@/lib/catalog/adminMenuDto";
import { Prisma } from "@prisma/client";

const mockGetSession = vi.fn();
const mockFindMenu = vi.fn();
const mockFindPowders = vi.fn();
const mockTransaction = vi.fn();
const mockUpload = vi.fn();
const mockRemoveImages = vi.fn();
const mockUpdate = vi.fn();
const mockCreateAllowed = vi.fn();
const mockDeleteAllowed = vi.fn();
const mockUpsertSize = vi.fn();
let item: AdminMenuItemRecord;
const tx = {
  menuItem: { update: (...args: unknown[]) => mockUpdate(...args), findUniqueOrThrow: async () => item },
  menuItemSize: { upsert: (...args: unknown[]) => mockUpsertSize(...args) },
  fusionAllowedPowder: {
    deleteMany: (...args: unknown[]) => mockDeleteAllowed(...args),
    createMany: (...args: unknown[]) => mockCreateAllowed(...args),
  },
  menuItemAllowedBaseLiquid: { deleteMany: vi.fn(), createMany: vi.fn() },
  matchaPowder: { findFirst: vi.fn(), update: vi.fn(), findMany: (...args: unknown[]) => mockFindPowders(...args) },
};
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  menuItem: { findUnique: (...args: unknown[]) => mockFindMenu(...args) },
  matchaPowder: { findMany: (...args: unknown[]) => mockFindPowders(...args) },
  milkType: { findMany: async () => [{ id: LIQUID_ID, is_active: true, is_default: true }] },
  defaultSizeConfig: { findMany: async () => [] },
  voucher: { count: async () => 0 },
  $transaction: (...args: unknown[]) => mockTransaction(...args),
} }));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureServerException: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  MENU_IMAGE_OUTPUT_CONTENT_TYPE: "image/webp",
  buildMenuImagePath: () => "products/fusion/new.webp",
  uploadMenuImage: (...args: unknown[]) => mockUpload(...args),
  removeMenuImages: (...args: unknown[]) => mockRemoveImages(...args),
  parseMenuImagePath: vi.fn(), contentTypeForMenuImagePath: vi.fn(), copyMenuImage: vi.fn(),
}));

import { PUT } from "@/app/api/admin/menu/[id]/route";
import { formatAdminMenuItem } from "@/lib/catalog/adminMenuDto";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_ID = "22222222-2222-4222-8222-222222222222";
const INACTIVE_ID = "33333333-3333-4333-8333-333333333333";
const LIQUID_ID = "44444444-4444-4444-8444-444444444444";
const MISSING_ID = "55555555-5555-4555-8555-555555555555";

function fixture(): AdminMenuItemRecord {
  return {
    id: ITEM_ID, name: "Fusion", description: null, category: "fusion", unit_price_vnd: null,
    image_url: null, is_available: true, sort_order: 0, created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"), is_seasonal: false, matcha_powder_id: null,
    default_powder_id: ACTIVE_ID, replacement_powder_id: null, replacementPowder: null, custom_powder_grams: null, base_liquid_note: null,
    default_base_liquid_id: LIQUID_ID, sizes: [], matchaPowder: null, defaultPowder: null,
    allowedBaseLiquids: [], defaultBaseLiquid: null,
    fusionAllowedPowders: [ACTIVE_ID, INACTIVE_ID].map((id) => ({
      menu_item_id: ITEM_ID, powder_id: id, matchaPowder: { id, is_available: id === ACTIVE_ID },
    })),
  };
}

function request(body: Record<string, unknown>, multipart = false, image = false): Request {
  if (!multipart) return new Request(`http://localhost/api/admin/menu/${ITEM_ID}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  if (image) form.set("image", new File(["image"], "drink.png", { type: "image/png" }));
  return new Request(`http://localhost/api/admin/menu/${ITEM_ID}`, { method: "PUT", body: form });
}
function put(body: Record<string, unknown>, multipart = false, image = false) {
  return PUT(request(body, multipart, image), { params: Promise.resolve({ id: ITEM_ID }) });
}

describe("Admin menu — giữ cấu hình powder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    item = fixture();
    mockGetSession.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mockFindMenu.mockImplementation(async (args: { where: { id?: string } }) => args.where.id ? item : null);
    mockFindPowders.mockResolvedValue([{ id: ACTIVE_ID, is_available: true }, { id: INACTIVE_ID, is_available: false }]);
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mockUpload.mockResolvedValue("https://cdn/new.webp");
    mockUpdate.mockImplementation(async (args: { data: Partial<AdminMenuItemRecord> }) => Object.assign(item, args.data));
    mockDeleteAllowed.mockImplementation(async () => { item.fusionAllowedPowders = []; });
    mockCreateAllowed.mockImplementation(async (args: { data: Array<{ menu_item_id: string; powder_id: string }> }) => {
      item.fusionAllowedPowders = args.data.map((entry) => ({
        ...entry, matchaPowder: { id: entry.powder_id, is_available: entry.powder_id === ACTIVE_ID },
      }));
    });
  });

  it("DTO admin giữ cả powder active và inactive đã cấu hình", () => {
    expect(formatAdminMenuItem(item, {}).allowed_powder_ids).toEqual([ACTIVE_ID, INACTIVE_ID]);
  });

  it("từ chối default powder không tồn tại trước upload và transaction", async () => {
    const response = await put({ default_powder_id: MISSING_ID }, true, true);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "POWDER_REFERENCE_NOT_FOUND", field: "default_powder_id", powder_ids: [MISSING_ID] },
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["latte", "matcha_powder_id", MISSING_ID],
    ["fusion", "allowed_powder_ids", [INACTIVE_ID, MISSING_ID]],
  ])("từ chối tham chiếu không tồn tại cho %s tại %s", async (category, field, value) => {
    item.category = category as string;
    const response = await put({ [field as string]: value }, true, true);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "POWDER_REFERENCE_NOT_FOUND", field, powder_ids: [MISSING_ID] },
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("giữ original inactive đã có replacement active và allow-list inactive", async () => {
    item.default_powder_id = INACTIVE_ID; item.replacement_powder_id = ACTIVE_ID;
    const savedIds = formatAdminMenuItem(item, {}).allowed_powder_ids;
    const response = await put({ default_powder_id: INACTIVE_ID, allowed_powder_ids: savedIds });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: {
      default_powder_id: INACTIVE_ID, allowed_powder_ids: [ACTIVE_ID, INACTIVE_ID],
    } });
    expect(mockCreateAllowed).toHaveBeenCalledWith({ data: [
      { menu_item_id: ITEM_ID, powder_id: ACTIVE_ID },
      { menu_item_id: ITEM_ID, powder_id: INACTIVE_ID },
    ] });
  });

  it("chấp nhận powder Latte inactive còn tồn tại", async () => {
    item.category = "latte";
    const response = await put({ matcha_powder_id: INACTIVE_ID });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { matcha_powder_id: INACTIVE_ID } });
  });

  it("chuẩn hóa ID trùng khi thay allow-list powder", async () => {
    const response = await put({ allowed_powder_ids: [INACTIVE_ID, INACTIVE_ID] });
    expect(response.status).toBe(200);
    expect(mockCreateAllowed).toHaveBeenCalledWith({ data: [{ menu_item_id: ITEM_ID, powder_id: INACTIVE_ID }] });
    expect(await response.json()).toMatchObject({ data: { allowed_powder_ids: [INACTIVE_ID] } });
  });

  it("map FK powder biến mất khi ghi thành 422 và dọn ảnh mới", async () => {
    mockUpdate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("FK disappeared", {
      code: "P2003", clientVersion: "test", meta: { field_name: "menu_items_default_powder_id_fkey (index)" },
    }));
    const response = await put({ default_powder_id: ACTIVE_ID }, true, true);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION", details: {
      reason: "POWDER_REFERENCE_NOT_FOUND", field: "default_powder_id", powder_ids: [ACTIVE_ID],
    } });
    expect(mockRemoveImages).toHaveBeenCalledWith(["products/fusion/new.webp"]);
  });

  it("trả 400 cho UUID powder sai trong multipart thay vì bỏ qua", async () => {
    const response = await put({ default_powder_id: "invalid-powder" }, true, true);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("trả 400 cho UUID Base Liquid sai trong multipart", async () => {
    const response = await put({ default_base_liquid_id: "invalid-liquid" }, true, true);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([false, true])("bỏ qua allow-list giữ cấu hình; [] xóa toàn bộ (multipart=%s)", async (multipart) => {
    const unchanged = await put({ name: "Đổi tên" }, multipart);
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toMatchObject({ data: { allowed_powder_ids: [ACTIVE_ID, INACTIVE_ID] } });
    expect(mockDeleteAllowed).not.toHaveBeenCalled();
    const cleared = await put({ allowed_powder_ids: [] }, multipart);
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ data: { allowed_powder_ids: [] } });
    expect(mockCreateAllowed).not.toHaveBeenCalled();
  });

  it.each([false, true])("từ chối original blank/null (multipart=%s)", async (multipart) => {
    const response = await put({ default_powder_id: multipart ? "" : null }, multipart);
    expect(response.status).toBe(422);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
  it.each([
    ["latte", "matcha_powder_id", false], ["latte", "matcha_powder_id", true],
    ["fusion", "default_powder_id", false], ["fusion", "allowed_powder_ids", false],
    ["fusion", "allowed_powder_ids", true],
  ] as const)("trả 400 cho UUID sai tại %s/%s (multipart=%s)", async (category, field, multipart) => {
    item.category = category;
    const response = await put({ [field]: field === "allowed_powder_ids" ? ["bad-uuid"] : "bad-uuid" }, multipart);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("giữ lỗi 400 khi powder đã thuộc Latte khác", async () => {
    item.category = "latte";
    mockFindMenu.mockImplementation(async (args: { where: { id?: string } }) => args.where.id ? item : { id: "other-latte" });
    const response = await put({ matcha_powder_id: INACTIVE_ID });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Loại bột này đã được sử dụng cho một món Latte khác", code: "VALIDATION_ERROR" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("không validate powder field không được áp dụng cho category đang lưu", async () => {
    const response = await put({ matcha_powder_id: MISSING_ID });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { matcha_powder_id: null } });

  });

  it.each([
    ["latte", "matcha_powder_id", "menu_items_matcha_powder_id_fkey"],
    ["fusion", "allowed_powder_ids", "fusion_allowed_powder_powder_id_fkey"],
  ] as const)("map đúng FK powder của %s/%s", async (category, field, constraint) => {
    item.category = category;
    mockUpdate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("FK disappeared", {
      code: "P2003", clientVersion: "test", meta: { field_name: constraint },
    }));
    const response = await put({ [field]: field === "allowed_powder_ids" ? [INACTIVE_ID] : INACTIVE_ID });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ details: { field, powder_ids: [INACTIVE_ID] } });
  });

  it.each([
    "menu_items_default_base_liquid_id_fkey", "fusion_allowed_powder_menu_item_id_fkey", "(not available)",
  ])("giữ lỗi FK khác hoặc không rõ là 500: %s", async (constraint) => {
    mockUpdate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Other FK", {
      code: "P2003", clientVersion: "test", meta: { field_name: constraint },
    }));
    const response = await put({ default_powder_id: ACTIVE_ID, allowed_powder_ids: [INACTIVE_ID] });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("giữ lỗi database bất ngờ là 500", async () => {
    mockUpdate.mockRejectedValue(new Error("database unavailable"));
    const response = await put({ default_powder_id: ACTIVE_ID });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it.each([
    [false, undefined], [false, []], [true, undefined], [true, []],
  ])("sửa Extra nhận sizes omitted/[] mà không tạo recipe (multipart=%s, sizes=%s)", async (multipart, sizes) => {
    item.category = "extras";
    item.unit_price_vnd = 10_000;
    const response = await put({ name: "Extra mới", unit_price_vnd: 20_000, ...(sizes !== undefined && { sizes }) }, multipart as boolean);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { name: "Extra mới", unit_price_vnd: 20_000, sizes: [] } });
    expect(mockUpsertSize).not.toHaveBeenCalled();
  });

  it.each([null, INACTIVE_ID])("quick-enable từ chối Fusion gốc không hợp lệ: %s", async (original) => {
    item.is_available = false;
    item.default_powder_id = original;
    const response = await put({ is_available: true });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION" });
    expect(item.is_available).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("quick-enable kiểm tra lại replacement trong transaction", async () => {
    item.is_available = false;
    item.default_powder_id = INACTIVE_ID;
    item.replacement_powder_id = ACTIVE_ID;
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
      // Model a configuration removed after preflight at the database boundary.
      item.replacement_powder_id = null;
      return callback(tx);
    });
    const response = await put({ is_available: true });
    expect(response.status).toBe(422);
    expect(item.is_available).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("quick-enable chấp nhận original inactive có replacement active", async () => {
    item.is_available = false;
    item.default_powder_id = INACTIVE_ID;
    item.replacement_powder_id = ACTIVE_ID;
    const response = await put({ is_available: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: {
      is_available: true, default_powder_id: INACTIVE_ID, replacement_powder_id: ACTIVE_ID,
    } });
  });

  it("quick-disable vẫn cho phép ngưng Fusion thiếu bột gốc", async () => {
    item.default_powder_id = null;
    const response = await put({ is_available: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { is_available: false } });
  });

  it("merged Fusion gốc inactive thiếu replacement active bị từ chối", async () => {
    item.default_powder_id = INACTIVE_ID;
    item.replacement_powder_id = null;
    const response = await put({ name: "Đổi tên" });
    expect(response.status).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("đổi gốc sang bột active xóa replacement cũ", async () => {
    item.default_powder_id = INACTIVE_ID;
    item.replacement_powder_id = ACTIVE_ID;
    const response = await put({ default_powder_id: ACTIVE_ID });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { default_powder_id: ACTIVE_ID, replacement_powder_id: null } });
  });
});
