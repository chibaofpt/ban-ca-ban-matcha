/**
 * Unit tests for admin voucher-packages API routes.
 * GET + POST /api/admin/voucher-packages
 * PUT + DELETE /api/admin/voucher-packages/[id]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));

const mockPkgFindMany = vi.fn();
const mockPkgFindUnique = vi.fn();
const mockPkgCreate = vi.fn();
const mockPkgUpdate = vi.fn();
const mockAddonFindUnique = vi.fn();
const mockAddonFindMany = vi.fn();
const mockMenuItemFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voucherPackage: {
      findMany: (...a: unknown[]) => mockPkgFindMany(...a),
      findUnique: (...a: unknown[]) => mockPkgFindUnique(...a),
      create: (...a: unknown[]) => mockPkgCreate(...a),
      update: (...a: unknown[]) => mockPkgUpdate(...a),
    },
    addonOption: {
      findUnique: (...a: unknown[]) => mockAddonFindUnique(...a),
      findMany: (...a: unknown[]) => mockAddonFindMany(...a),
    },
    menuItem: {
      findUnique: (...a: unknown[]) => mockMenuItemFindUnique(...a),
    },
  },
}));

// Mock the pricing engine â€” auto-calc covered_price_vnd calls buildPricingContext + resolveOrderItemPrice
const mockBuildPricingContext = vi.fn();
const mockResolveOrderItemPrice = vi.fn();
const mockResolveOrderItemPremiumLatte = vi.fn();

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: (...a: unknown[]) => mockBuildPricingContext(...a),
  resolveOrderItemPrice: (...a: unknown[]) => mockResolveOrderItemPrice(...a),
  resolveOrderItemPremiumLatte: (...a: unknown[]) => mockResolveOrderItemPremiumLatte(...a),
}));

import { GET, POST } from "@/app/api/admin/voucher-packages/route";
import { PUT, DELETE } from "@/app/api/admin/voucher-packages/[id]/route";

// â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ADMIN_SESSION = { id: "admin-001", role: "ADMIN" };
const STAFF_SESSION = { id: "staff-001", role: "STAFF" };

const PKG_ID = "550e8400-e29b-41d4-a716-446655440001";
const MENU_ITEM_ID = "550e8400-e29b-41d4-a716-446655440002";
const ADDON_ID = "550e8400-e29b-41d4-a716-446655440003";
const EXTRA_MATCHA_ADDON_ID = "550e8400-e29b-41d4-a716-446655440004";
const POWDER_ID = "550e8400-e29b-41d4-a716-446655440005";

const existingPkg = {
  id: PKG_ID,
  name: "Free TrÃ  Xanh M",
  voucher_type: "PRODUCT",
  points_cost: 5,
  is_active: true,
};

/** Minimal latte menu item returned by Prisma include with sizes and fusionAllowedPowders */
const latteMenuItem = {
  id: MENU_ITEM_ID,
  category: "latte",
  is_available: true,
  matcha_powder_id: POWDER_ID,
  default_powder_id: null,
  custom_powder_grams: null,
  fusionAllowedPowders: [],
  sizes: [
    { size: "SMALL", base_price_vnd: 33000, milk_ml: 200 },
    { size: "MEDIUM", base_price_vnd: 38000, milk_ml: 250 },
    { size: "LARGE", base_price_vnd: 63000, milk_ml: 350 },
  ],
};

const basePricingCtx = {
  powderPriceMap: { [POWDER_ID]: 5000 },
  milkPriceMap: {},
  defaultMilkPricePerMl: 40,
  powderSizeConfigs: {},
  defaultSizeConfig: {},
};

function makeReq(body: unknown, url = "http://localhost/api/admin/voucher-packages"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const idParams = Promise.resolve({ id: PKG_ID });

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /api/admin/voucher-packages
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

describe("GET /api/admin/voucher-packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("returns 403 for STAFF role", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for CUSTOMER role", async () => {
    mockGetSession.mockResolvedValue({ id: "c", role: "CUSTOMER" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns all packages for ADMIN", async () => {
    mockPkgFindMany.mockResolvedValue([existingPkg]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(PKG_ID);
  });

  it("returns 500 on DB error", async () => {
    mockPkgFindMany.mockRejectedValue(new Error("DB down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST /api/admin/voucher-packages
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

describe("POST /api/admin/voucher-packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("returns 403 for STAFF role", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeReq({ voucher_type: "DISCOUNT" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("creates DISCOUNT package and returns 201", async () => {
    const created = { id: PKG_ID, voucher_type: "DISCOUNT", name: "20% Off" };
    mockPkgCreate.mockResolvedValue(created);

    const res = await POST(
      makeReq({
        voucher_type: "DISCOUNT",
        name: "20% Off",
        points_cost: 3,
        discount_type: "PERCENT",
        discount_value: 20,
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.voucher_type).toBe("DISCOUNT");
  });

  it("creates PRODUCT package and validates menu item exists", async () => {
    // Route now calls pricing engine to auto-calc covered_price_vnd
    mockMenuItemFindUnique.mockResolvedValue(latteMenuItem);
    mockBuildPricingContext.mockResolvedValue(basePricingCtx);
    mockResolveOrderItemPrice.mockReturnValue(65000); // server computes this
    mockAddonFindMany.mockResolvedValue([]);           // no addons included
    mockPkgCreate.mockResolvedValue({ id: PKG_ID, voucher_type: "PRODUCT", covered_price_vnd: 65000 });

    const res = await POST(
      makeReq({
        voucher_type: "PRODUCT",
        name: "Free M TrÃ  Xanh",
        points_cost: 5,
        menu_item_id: MENU_ITEM_ID,
        size: "SMALL",
        included_addon_option_ids: [],
        // No covered_price_vnd â€” server auto-calculates it
      })
    );

    expect(res.status).toBe(201);
    expect(mockMenuItemFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MENU_ITEM_ID } })
    );
    // covered_price_vnd should be 65000 (from pricing engine mock)
    expect(mockPkgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ covered_price_vnd: 65000 }),
      })
    );
  });

  it("returns 404 when PRODUCT package references nonexistent menu item", async () => {
    mockMenuItemFindUnique.mockResolvedValue(null);

    const res = await POST(
      makeReq({
        voucher_type: "PRODUCT",
        name: "Invalid",
        points_cost: 5,
        menu_item_id: MENU_ITEM_ID,
        size: "SMALL",
        included_addon_option_ids: [],
      })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("creates ADDON package with non-extra-matcha addon", async () => {
    mockAddonFindUnique.mockResolvedValue({ gram_value: null, label: "Kem", price_vnd: 8000 });
    mockPkgCreate.mockResolvedValue({ id: PKG_ID, voucher_type: "ADDON" });

    const res = await POST(
      makeReq({
        voucher_type: "ADDON",
        name: "Free Kem",
        points_cost: 2,
        addon_option_id: ADDON_ID,
        // No covered_price_vnd â€” server auto-calculates from addon.price_vnd
      })
    );

    expect(res.status).toBe(201);
    // covered_price_vnd should be 8000 (from addon.price_vnd)
    expect(mockPkgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ covered_price_vnd: 8000 }),
      })
    );
  });

  it("returns 400 when ADDON package targets Extra Matcha (gram_value > 0)", async () => {
    // Extra matcha has gram_value set (non-null, > 0)
    mockAddonFindUnique.mockResolvedValue({ gram_value: { toNumber: () => 2 }, label: "+2g Matcha" });

    // Need to mock gram_value as Decimal-like object with non-null behavior
    const gramValueDecimal = { toString: () => "2", valueOf: () => 2 };
    Object.defineProperty(gramValueDecimal, "toNumber", { value: () => 2 });
    mockAddonFindUnique.mockResolvedValue({ gram_value: gramValueDecimal, label: "+2g" });

    const res = await POST(
      makeReq({
        voucher_type: "ADDON",
        name: "Free Extra Matcha",
        points_cost: 2,
        addon_option_id: EXTRA_MATCHA_ADDON_ID,
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when ADDON references nonexistent addon option", async () => {
    mockAddonFindUnique.mockResolvedValue(null);

    const res = await POST(
      makeReq({
        voucher_type: "ADDON",
        name: "Invalid",
        points_cost: 2,
        addon_option_id: ADDON_ID,
      })
    );

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("does not set discount fields for PRODUCT package", async () => {
    mockMenuItemFindUnique.mockResolvedValue(latteMenuItem);
    mockBuildPricingContext.mockResolvedValue(basePricingCtx);
    mockResolveOrderItemPrice.mockReturnValue(75000);
    mockAddonFindMany.mockResolvedValue([]);
    mockPkgCreate.mockResolvedValue({ id: PKG_ID });

    await POST(
      makeReq({
        voucher_type: "PRODUCT",
        name: "Free Item",
        points_cost: 5,
        menu_item_id: MENU_ITEM_ID,
        size: "MEDIUM",
        included_addon_option_ids: [],
      })
    );

    // PRODUCT branch: auto-calculates covered_price_vnd, does NOT include discount_type or discount_value
    expect(mockPkgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voucher_type: "PRODUCT",
          // auto-calculated covered_price_vnd = 75000 (from pricing engine mock)
          covered_price_vnd: 75000,
        }),
      })
    );
    // Verify no discount fields were set
    const createData = mockPkgCreate.mock.calls[0][0].data;
    expect(createData.discount_type).toBeUndefined();
    expect(createData.discount_value).toBeUndefined();
  });

  it("returns 500 on DB error", async () => {
    mockMenuItemFindUnique.mockResolvedValue(latteMenuItem);
    mockBuildPricingContext.mockResolvedValue(basePricingCtx);
    mockResolveOrderItemPrice.mockReturnValue(65000);
    mockAddonFindMany.mockResolvedValue([]);
    mockPkgCreate.mockRejectedValue(new Error("timeout"));

    const res = await POST(
      makeReq({
        voucher_type: "PRODUCT",
        name: "X",
        points_cost: 1,
        menu_item_id: MENU_ITEM_ID,
        size: "SMALL",
        included_addon_option_ids: [],
      })
    );

    expect(res.status).toBe(500);
  });
});

// ── Validation bổ sung ──────────────────────────────────────────────────────

describe("POST /api/admin/voucher-packages — validation bổ sung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("FIXED discount_value không chia hết cho 1000 → VALIDATION_ERROR", async () => {
    const res = await POST(
      makeReq({
        voucher_type: "DISCOUNT",
        name: "Fixed 15500",
        points_cost: 1,
        discount_type: "FIXED",
        discount_value: 15500, // NOT divisible by 1000
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("PRODUCT package covered_price_vnd chỉ tính giá nước, không cộng addon", async () => {
    const ADDON_KEM_ID = "a50e8400-e29b-41d4-a716-446655440099";
    // Setup: latte SMALL with addon kem (15k)
    mockMenuItemFindUnique.mockResolvedValue(latteMenuItem);
    mockBuildPricingContext.mockResolvedValue(basePricingCtx);
    mockResolveOrderItemPrice.mockReturnValue(45000); // base SMALL = 45k

    // Addon kem 15k
    const kemAddon = { id: ADDON_KEM_ID, price_vnd: 15000, gram_value: null };
    mockAddonFindMany.mockResolvedValue([kemAddon]);

    // Mock create to capture what covered_price_vnd is set to
    mockPkgCreate.mockImplementation(
      (args: { data: Record<string, unknown> }) => Promise.resolve({ id: "new-pkg", ...args.data })
    );

    const res = await POST(
      makeReq({
        voucher_type: "PRODUCT",
        name: "Trà Xanh Sữa SMALL + Kem",
        points_cost: 5,
        menu_item_id: MENU_ITEM_ID,
        size: "SMALL",
        included_addon_option_ids: [ADDON_KEM_ID],
      })
    );

    expect(res.status).toBe(201);

    // covered_price_vnd should be 45000 (drink only), NOT 45000 + 15000 = 60000
    const createCall = mockPkgCreate.mock.calls[0][0] as { data: { covered_price_vnd: number } };
    expect(createCall.data.covered_price_vnd).toBe(45000);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/voucher-packages/[id]
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("PUT /api/admin/voucher-packages/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("returns 403 for non-ADMIN", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const res = await PUT(makeReq({ name: "New Name" }), { params: idParams });
    expect(res.status).toBe(403);
  });

  it("returns 404 when package not found", async () => {
    mockPkgFindUnique.mockResolvedValue(null);
    const res = await PUT(makeReq({ name: "New Name" }), { params: idParams });
    expect(res.status).toBe(404);
  });

  it("updates name and points_cost", async () => {
    mockPkgFindUnique.mockResolvedValue(existingPkg);
    mockPkgUpdate.mockResolvedValue({ ...existingPkg, name: "Updated Name", points_cost: 10 });

    const res = await PUT(
      makeReq({ name: "Updated Name", points_cost: 10 }),
      { params: idParams }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe("Updated Name");
  });

  it("deactivates package with is_active: false", async () => {
    mockPkgFindUnique.mockResolvedValue(existingPkg);
    mockPkgUpdate.mockResolvedValue({ ...existingPkg, is_active: false });

    await PUT(makeReq({ is_active: false }), { params: idParams });

    expect(mockPkgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ is_active: false }),
      })
    );
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DELETE /api/admin/voucher-packages/[id]
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

describe("DELETE /api/admin/voucher-packages/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("returns 403 for non-ADMIN", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const req = new NextRequest(`http://localhost/api/admin/voucher-packages/${PKG_ID}`, { method: "DELETE" });
    const res = await DELETE(req, { params: idParams });
    expect(res.status).toBe(403);
  });

  it("returns 404 when package not found", async () => {
    mockPkgFindUnique.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/admin/voucher-packages/${PKG_ID}`, { method: "DELETE" });
    const res = await DELETE(req, { params: idParams });
    expect(res.status).toBe(404);
  });

  it("soft-deletes (is_active = false) and returns 200", async () => {
    mockPkgFindUnique.mockResolvedValue(existingPkg);
    mockPkgUpdate.mockResolvedValue({ ...existingPkg, is_active: false });

    const req = new NextRequest(`http://localhost/api/admin/voucher-packages/${PKG_ID}`, { method: "DELETE" });
    const res = await DELETE(req, { params: idParams });

    expect(res.status).toBe(200);
    expect(mockPkgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PKG_ID },
        data: { is_active: false },
      })
    );
  });
});
