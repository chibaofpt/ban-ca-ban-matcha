/**
 * Unit tests for POST /api/admin/menu/create-latte-with-powder
 *
 * Strategy: mock lib/prisma, lib/auth, lib/storage.
 * The route creates powder + latte + 3 sizes + sets reference in ONE transaction.
 * Tests verify the transaction sequence, auth guards, and validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// â”€â”€ Mocks declared BEFORE imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockGetSession = vi.fn();
const mockMatchaPowderCreate = vi.fn();
const mockMatchaPowderUpdate = vi.fn();
const mockMenuItemCreate = vi.fn();
const mockMenuItemSizeCreateMany = vi.fn();
const mockMenuItemFindUniqueOrThrow = vi.fn();
const mockPowderSizeConfigCreateMany = vi.fn();
const mockTransaction = vi.fn();
const mockUploadMenuImage = vi.fn();
const mockRemoveMenuImages = vi.fn();
const mockBuildMenuImagePath = vi.fn();
const mockDefaultSizeConfigFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/storage", () => ({
  uploadMenuImage: (...args: unknown[]) => mockUploadMenuImage(...args),
  removeMenuImages: (...args: unknown[]) => mockRemoveMenuImages(...args),
  buildMenuImagePath: (...args: unknown[]) => mockBuildMenuImagePath(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    defaultSizeConfig: {
      findMany: (...args: unknown[]) => mockDefaultSizeConfigFindMany(...args),
    },
    milkType: {
      findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args),
    },
  },
}));

// â”€â”€ Import AFTER mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { POST } from "@/app/api/admin/menu/create-latte-with-powder/route";

// â”€â”€ Test Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  default_base_liquid_id: null,
  base_liquid_note: null,
  custom_powder_grams: null,
  image_url: null,
  description: null,
  updated_at: new Date(),
  sizes: [
    { size: "SMALL", base_price_vnd: 55000, base_liquid_ml: null },
    { size: "MEDIUM", base_price_vnd: 65000, base_liquid_ml: null },
    { size: "LARGE", base_price_vnd: 75000, base_liquid_ml: null },
  ],
  matchaPowder: { id: POWDER_ID, name: "Meyumi", type: "NONE" },
  defaultPowder: null,
  fusionAllowedPowders: [],
  allowedBaseLiquids: [],
};

const defaultSizeConfigs = [
  { size: "SMALL", milk_ml: 130, powder_gram: 3.5 },
  { size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 },
  { size: "LARGE", milk_ml: 300, powder_gram: 8.0 },
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
      { size: "SMALL", base_price_vnd: 55000 },
      { size: "MEDIUM", base_price_vnd: 65000 },
      { size: "LARGE", base_price_vnd: 75000 },
    ]),
    new_powder_name: "Meyumi",
    new_powder_price_per_gram: "6000",
    ...overrides,
  };
}

/** Setup standard transaction mock â€” executes callback with a controlled tx object. */
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

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("POST /api/admin/menu/create-latte-with-powder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockUploadMenuImage.mockResolvedValue("https://example.com/image.jpg");
    mockRemoveMenuImages.mockResolvedValue(undefined);
    mockBuildMenuImagePath.mockReturnValue("products/latte/matcha-seo-12345678.webp");
    mockMilkTypeFindMany.mockResolvedValue([
      { id: "550e8400-e29b-41d4-a716-446655440099", is_default: true },
    ]);
  });

  // â”€â”€ Auth & Role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("tráº£ 401 khi chÆ°a Ä‘Äƒng nháº­p", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("tráº£ 403 khi role lÃ  STAFF", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("tráº£ 403 khi role lÃ  CUSTOMER", async () => {
    mockGetSession.mockResolvedValue({ id: "c-001", role: "CUSTOMER" });
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  // â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("tráº£ 400 khi thiáº¿u tÃªn mÃ³n", async () => {
    const res = await POST(makeFormDataReq(validFormData({ name: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi thiáº¿u sizes", async () => {
    const noSizes = validFormData();
    Reflect.deleteProperty(noSizes, "sizes");
    const res = await POST(makeFormDataReq(noSizes));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi sizes JSON khÃ´ng há»£p lá»‡", async () => {
    const res = await POST(makeFormDataReq(validFormData({ sizes: "not-json" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi sizes khÃ´ng Ä‘á»§ 3 size M/L/XL", async () => {
    const res = await POST(
      makeFormDataReq(
        validFormData({
          sizes: JSON.stringify([{ size: "SMALL", base_price_vnd: 55000 }]),
        })
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi thiáº¿u tÃªn bá»™t má»›i", async () => {
    const res = await POST(makeFormDataReq(validFormData({ new_powder_name: "" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi giÃ¡ bá»™t khÃ´ng há»£p lá»‡ (Ã¢m)", async () => {
    const res = await POST(makeFormDataReq(validFormData({ new_powder_price_per_gram: "-100" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi giÃ¡ bá»™t khÃ´ng pháº£i sá»‘", async () => {
    const res = await POST(makeFormDataReq(validFormData({ new_powder_price_per_gram: "abc" })));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  // â”€â”€ Happy path: táº¡o bá»™t má»›i inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("táº¡o thÃ nh cÃ´ng â€” tráº£ 201 vá»›i menu_item vÃ  powder_name", async () => {
    setupTx();
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.menu_item).toBeDefined();
    expect(json.data.powder_name).toBe("Meyumi");
  });

  it("táº¡o powder TRÆ¯á»šC trong transaction (Step 1)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMatchaPowderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Meyumi",
          price_per_gram: 6000,
          type: "NONE",
          is_available: true,
          reference_latte_item_id: null, // chÆ°a cÃ³ latte ID lÃºc nÃ y
        }),
      })
    );
  });

  it("táº¡o menu item vá»›i matcha_powder_id tá»« bá»™t vá»«a táº¡o (Step 3)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMenuItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Matcha Latte",
          category: "latte",
          matcha_powder_id: POWDER_ID, // powder.id tá»« Step 1
        }),
      })
    );
  });

  it("táº¡o Ä‘Ãºng 3 MenuItemSize rows (Step 4)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMenuItemSizeCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ size: "SMALL", base_price_vnd: 55000 }),
          expect.objectContaining({ size: "MEDIUM", base_price_vnd: 65000 }),
          expect.objectContaining({ size: "LARGE", base_price_vnd: 75000 }),
        ]),
      })
    );
  });

  it("update powder vá»›i reference_latte_item_id sau khi táº¡o latte (Step 5)", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockMatchaPowderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: POWDER_ID },
        data: expect.objectContaining({
          reference_latte_item_id: ITEM_ID, // latte.id tá»« Step 3
        }),
      })
    );
  });

  it("powder_name trong response khá»›p vá»›i tÃªn bá»™t vá»«a táº¡o", async () => {
    const customPowder = { ...mockPowder, id: POWDER_ID, name: "Hana Premium" };
    setupTx({ powderCreate: customPowder });
    const res = await POST(makeFormDataReq(validFormData({ new_powder_name: "Hana Premium" })));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.powder_name).toBe("Hana Premium");
  });

  // â”€â”€ Happy path: vá»›i size_config riÃªng cho bá»™t â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("táº¡o PowderSizeConfig khi cÃ³ new_powder_size_config", async () => {
    setupTx();
    const sizeConfig = JSON.stringify([
      { size: "SMALL", grams: 4.0 },
      { size: "MEDIUM", grams: 6.0 },
    ]);
    const res = await POST(
      makeFormDataReq(validFormData({ new_powder_size_config: sizeConfig }))
    );
    expect(res.status).toBe(201);
    expect(mockPowderSizeConfigCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ size: "SMALL", grams: 4.0 }),
          expect.objectContaining({ size: "MEDIUM", grams: 6.0 }),
        ]),
      })
    );
  });

  it("khÃ´ng gá»i createMany PowderSizeConfig khi khÃ´ng cÃ³ size_config", async () => {
    setupTx();
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(201);
    expect(mockPowderSizeConfigCreateMany).not.toHaveBeenCalled();
  });

  // â”€â”€ Happy path: null sizes (size khÃ´ng bÃ¡n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("cháº¥p nháº­n base_price_vnd = null (size khÃ´ng bÃ¡n)", async () => {
    setupTx();
    const res = await POST(
      makeFormDataReq(
        validFormData({
          sizes: JSON.stringify([
            { size: "SMALL", base_price_vnd: 55000 },
            { size: "MEDIUM", base_price_vnd: null },
            { size: "LARGE", base_price_vnd: null },
          ]),
        })
      )
    );
    expect(res.status).toBe(201);
  });

  // â”€â”€ Transaction rollback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("tráº£ 500 khi transaction tháº¥t báº¡i (rollback toÃ n bá»™)", async () => {
    mockDefaultSizeConfigFindMany.mockResolvedValue(defaultSizeConfigs);
    mockTransaction.mockRejectedValue(new Error("DB connection lost"));
    const res = await POST(makeFormDataReq(validFormData()));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });

  it("tráº£ 400 khi bá»™t Ä‘Ã£ Ä‘Æ°á»£c gÃ¡n cho Latte khÃ¡c (P2002 unique constraint)", async () => {
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

  // â”€â”€ Upload áº£nh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("khÃ´ng gá»i uploadMenuImage khi khÃ´ng cÃ³ áº£nh", async () => {
    setupTx();
    await POST(makeFormDataReq(validFormData()));
    expect(mockUploadMenuImage).not.toHaveBeenCalled();
  });

  it("dùng image_filename để tạo object path SEO", async () => {
    setupTx();
    const image = new File(["image"], "crop.webp", { type: "image/webp" });

    await POST(makeFormDataReq({
      ...validFormData(),
      image_filename: "Matcha Đậu Đỏ",
      image,
    }));

    expect(mockBuildMenuImagePath).toHaveBeenCalledWith(expect.objectContaining({
      category: "latte",
      productName: "Matcha Latte",
      requestedName: "Matcha Đậu Đỏ",
      contentType: "image/webp",
    }));
    expect(mockUploadMenuImage).toHaveBeenCalledWith(
      "products/latte/matcha-seo-12345678.webp",
      expect.any(Buffer),
      "image/webp",
    );
  });

  it("xóa ảnh vừa upload khi transaction database thất bại", async () => {
    mockDefaultSizeConfigFindMany.mockResolvedValue(defaultSizeConfigs);
    mockTransaction.mockRejectedValue(new Error("DB failed"));
    const image = new File(["image"], "crop.webp", { type: "image/webp" });

    const response = await POST(makeFormDataReq({ ...validFormData(), image }));

    expect(response.status).toBe(500);
    expect(mockRemoveMenuImages).toHaveBeenCalledWith([
      "products/latte/matcha-seo-12345678.webp",
    ]);
  });

  it("response menu_item cÃ³ Ä‘á»§ cÃ¡c field cáº§n thiáº¿t", async () => {
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
