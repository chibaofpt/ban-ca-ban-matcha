/**
 * Unit tests for POST /api/admin/menu/create-latte-with-powder
 *
 * Strategy: mock lib/prisma, lib/auth, lib/storage.
 * The route creates powder + latte + 3 sizes + sets reference in ONE transaction.
 * Tests verify the transaction sequence, auth guards, and validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared BEFORE imports ─────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockMatchaPowderCreate = vi.fn();
const mockMatchaPowderUpdate = vi.fn();
const mockMenuItemCreate = vi.fn();
const mockMenuItemSizeCreateMany = vi.fn();
const mockMenuItemFindUniqueOrThrow = vi.fn();
const mockPowderSizeConfigCreateMany = vi.fn();
const mockTransaction = vi.fn();
const mockUploadMenuImage = vi.fn();
const mockDefaultSizeConfigFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/storage", () => ({
  uploadMenuImage: (...args: unknown[]) => mockUploadMenuImage(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    defaultSizeConfig: {
      findMany: (...args: unknown[]) => mockDefaultSizeConfigFindMany(...args),
    },
  },
}));

// ── Import AFTER mocks ─────────────────────────────────────────────────────────

import { POST } from "@/app/api/admin/menu/create-latte-with-powder/route";

// ── Test Constants ─────────────────────────────────────────────────────────────

const ADMIN_SESSION = { id: "admin-001", role: "ADMIN" };
const STAFF_SESSION = { id: "staff-001", role: "STAFF" };

const POWDER_ID = "550e8400-e29b-41d4-a716-446655440001";
const ITEM_ID   = "550e8400-e29b-41d4-a716-446655440002";

const mockPowder = {
  id: POWDER_ID,
  name: "Meyumi",
  manufacturer: null,
  description: null,
  price_per_gram: 6000,
  type: "NONE",
  reference_latte_item_id: null,
  fragrance: null,
  body: null,
  bitterness: null,
  umami: null,
  color: null,
  is_available: true,
  created_at: new Date(),
  powderSizeConfigs: [],
};

const mockMenuItem = {
  id: ITEM_ID,
  name: "Matcha Latte",
  category: "latte",
  is_available: true,
  is_seasonal: false,
  sort_order: 0,
  matcha_powder_id: POWDER_ID,
  default_powder_id: null,
  base_liquid_note: null,
  custom_powder_grams: null,
  image_url: null,
  description: null,
  updated_at: new Date(),
  sizes: [
    { size: "M", base_price_vnd: 55000, milk_ml: 130 },
    { size: "L", base_price_vnd: 65000, milk_ml: 200 },
    { size: "XL", base_price_vnd: 75000, milk_ml: 300 },
  ],
  matchaPowder: { id: POWDER_ID, name: "Meyumi", type: "NONE" },
  defaultPowder: null,
  fusionAllowedPowders: [],
};

const defaultSizeConfigs = [
  { size: "M", milk_ml: 130, powder_gram: 3.5 },
  { size: "L", milk_ml: 200, powder_gram: 4.5 },
  { size: "XL", milk_ml: 300, powder_gram: 8.0 },
];

/** Build a multipart/form-data NextRequest from plain object. */
function makeFormDataReq(fields: Record<string, string | Blob>): NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v);
  }
  return new NextRequest(
    "http://localhost/api/admin/menu/create-latte-with-powder",
    { method: "POST", body: fd }
  );
}

/** Build a valid create-latte-with-powder FormData. */
function validFormData(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    name: "Matcha Latte",
    is_available: "true",
    is_seasonal: "false",
    sort_order: "0",
    sizes: JSON.stringify([
      { size: "M", base_price_vnd: 55000 },
      { size: "L", base_price_vnd: 65000 },
      { size: "XL", base_price_vnd: 75000 },
    ]),
    new_powder_name: "Meyumi",
    new_powder_price_per_gram: "6000",
    ...overrides,
  };
}

/** Setup standard transaction mock — executes callback with a controlled tx object. */
function setupTx(overrides: {
  powderCreate?: object;
  menuItemCreate?: object;
  menuItemFetch?: object;
  sizeConfigCreate?: void;
} = {}) {
  mockMatchaPowderCreate.mockResolvedValue(overrides.powderCreate ?? mockPowder);
  mockMenuItemCreate.mockResolvedValue(overrides.menuItemCreate ?? mockMenuItem);
  mockMenuItemFindUniqueOrThrow.mockResolvedValue(overrides.menuItemFetch ?? mockMenuItem);
  mockMenuItemSizeCreateMany.mockResolvedValue({ count: 3 });
  mockPowderSizeConfigCreateMany.mockResolvedValue({ count: 0 });
  mockMatchaPowderUpdate.mockResolvedValue({ ...mockPowder, reference_latte_item_id: ITEM_ID });
  mockDefaultSizeConfigFindMany.mockResolvedValue(defaultSizeConfigs);

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      matchaPowder: {
        create: (...args: unknown[]) => mockMatchaPowderCreate(...args),
        update: (...args: unknown[]) => mockMatchaPowderUpdate(...args),
      },
      menuItem: {
        create: (...args: unknown[]) => mockMenuItemCreate(...args),
        findUniqueOrThrow: (...args: unknown[]) => mockMenuItemFindUniqueOrThrow(...args),
      },
      menuItemSize: {
        createMany: (...args: unknown[]) => mockMenuItemSizeCreateMany(...args),
      },
      powderSizeConfig: {
        createMany: (...args: unknown[]) => mockPowderSizeConfigCreateMany(...args),
      },
    };
    return fn(tx);
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/menu/create-latte-with-powder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockUploadMenuImage.mockResolvedValue("https://example.com/image.jpg");
  });

  // ── Auth & Role ─────────────────────────────────────────────────────────────

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("trả 403 khi role là STAFF", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("trả 403 khi role là CUSTOMER", async () => {
    mockGetSession.mockResolvedValue({ id: "c-001", role: "CUSTOMER" });
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("trả 400 khi thiếu tên món", async () => {
    const res = await POST(makeFormDataReq(validFormData({ name: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi thiếu sizes", async () => {
    const { sizes: _, ...noSizes } = validFormData();
    const res = await POST(makeFormDataReq(noSizes));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi sizes JSON không hợp lệ", async () => {
    const res = await POST(makeFormDataReq(validFormData({ sizes: "not-json" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi sizes không đủ 3 size M/L/XL", async () => {
    const res = await POST(
      makeFormDataReq(
        validFormData({
          sizes: JSON.stringify([{ size: "M", base_price_vnd: 55000 }]),
        })
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi thiếu tên bột mới", async () => {
    const res = await POST(makeFormDataReq(validFormData({ new_powder_name: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi giá bột không hợp lệ (âm)", async () => {
    const res = await POST(makeFormDataReq(validFormData({ new_powder_price_per_gram: "-100" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi giá bột không phải số", async () => {
    const res = await POST(makeFormDataReq(validFormData({ new_powder_price_per_gram: "abc" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  // ── Happy path: tạo bột mới inline ─────────────────────────────────────────

  it("tạo thành công — trả 201 với menu_item và powder_name", async () => {
    setupTx();
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.menu_item).toBeDefined();
    expect(json.data.powder_name).toBe("Meyumi");
  });

  it("tạo powder TRƯỚC trong transaction (Step 1)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMatchaPowderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Meyumi",
          price_per_gram: 6000,
          type: "NONE",
          is_available: true,
          reference_latte_item_id: null, // chưa có latte ID lúc này
        }),
      })
    );
  });

  it("tạo menu item với matcha_powder_id từ bột vừa tạo (Step 3)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMenuItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Matcha Latte",
          category: "latte",
          matcha_powder_id: POWDER_ID, // powder.id từ Step 1
        }),
      })
    );
  });

  it("tạo đúng 3 MenuItemSize rows (Step 4)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMenuItemSizeCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ size: "M", base_price_vnd: 55000 }),
          expect.objectContaining({ size: "L", base_price_vnd: 65000 }),
          expect.objectContaining({ size: "XL", base_price_vnd: 75000 }),
        ]),
      })
    );
  });

  it("update powder với reference_latte_item_id sau khi tạo latte (Step 5)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMatchaPowderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: POWDER_ID },
        data: expect.objectContaining({
          reference_latte_item_id: ITEM_ID, // latte.id từ Step 3
        }),
      })
    );
  });

  it("powder_name trong response khớp với tên bột vừa tạo", async () => {
    const customPowder = { ...mockPowder, id: POWDER_ID, name: "Hana Premium" };
    setupTx({ powderCreate: customPowder });
    const res = await POST(makeFormDataReq(validFormData({ new_powder_name: "Hana Premium" })));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.powder_name).toBe("Hana Premium");
  });

  // ── Happy path: với size_config riêng cho bột ───────────────────────────────

  it("tạo PowderSizeConfig khi có new_powder_size_config", async () => {
    setupTx();
    const sizeConfig = JSON.stringify([
      { size: "M", grams: 4.0 },
      { size: "L", grams: 6.0 },
    ]);
    const res = await POST(
      makeFormDataReq(validFormData({ new_powder_size_config: sizeConfig }))
    );
    expect(res.status).toBe(201);
    expect(mockPowderSizeConfigCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ size: "M", grams: 4.0 }),
          expect.objectContaining({ size: "L", grams: 6.0 }),
        ]),
      })
    );
  });

  it("không gọi createMany PowderSizeConfig khi không có size_config", async () => {
    setupTx();
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(201);
    expect(mockPowderSizeConfigCreateMany).not.toHaveBeenCalled();
  });

  // ── Happy path: null sizes (size không bán) ─────────────────────────────────

  it("chấp nhận base_price_vnd = null (size không bán)", async () => {
    setupTx();
    const res = await POST(
      makeFormDataReq(
        validFormData({
          sizes: JSON.stringify([
            { size: "M", base_price_vnd: 55000 },
            { size: "L", base_price_vnd: null },
            { size: "XL", base_price_vnd: null },
          ]),
        })
      )
    );
    expect(res.status).toBe(201);
  });

  // ── Transaction rollback ────────────────────────────────────────────────────

  it("trả 500 khi transaction thất bại (rollback toàn bộ)", async () => {
    mockDefaultSizeConfigFindMany.mockResolvedValue(defaultSizeConfigs);
    mockTransaction.mockRejectedValue(new Error("DB connection lost"));
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });

  it("trả 400 khi bột đã được gán cho Latte khác (P2002 unique constraint)", async () => {
    mockDefaultSizeConfigFindMany.mockResolvedValue(defaultSizeConfigs);
    const prismaError = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
      meta: { target: ["reference_latte_item_id"] },
    });
    mockTransaction.mockRejectedValue(prismaError);
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  // ── Upload ảnh ─────────────────────────────────────────────────────────────

  it("không gọi uploadMenuImage khi không có ảnh", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockUploadMenuImage).not.toHaveBeenCalled();
  });

  it("response menu_item có đủ các field cần thiết", async () => {
    setupTx();
    const res = await POST(makeFormDataReq(validFormData()));
    const json = await res.json();
    const item = json.data.menu_item;
    expect(item).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      category: "latte",
      sizes: expect.any(Array),
    });
  });
});
