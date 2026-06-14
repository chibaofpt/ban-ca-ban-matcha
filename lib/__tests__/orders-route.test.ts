/**
 * Unit tests for POST /api/orders (customer order creation).
 *
 * Strategy: mock lib/prisma, lib/auth — keep lib/orders real (already tested).
 * Mock prisma.$transaction to execute callback with a controlled tx object.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSendPushToRoles = vi.fn();

vi.mock("@/lib/push", () => ({
  sendPushToRoles: (...args: unknown[]) => mockSendPushToRoles(...args),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: Function) => fn(),
  };
});

// ── Mocks declared before dynamic imports ─────────────────────────────────────

const mockGetSession = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockCheckStoreOpen = vi.fn();
const mockValidatePickupTime = vi.fn();

// Mock lib/auth
vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  normalizePhone: (p: string) => p,
}));

// Mock lib/storeSchedule
vi.mock("@/lib/storeSchedule", () => ({
  checkStoreOpen: () => mockCheckStoreOpen(),
  validatePickupTime: (pt: Date, now?: Date) => mockValidatePickupTime(pt, now),
}));

// Mock lib/pricing (needed transitively by lib/orders)
vi.mock("@/lib/pricing", () => ({
  buildPricingContext: vi.fn().mockResolvedValue({
    defaultSizeConfigs: [],
    powderPriceMap: {},
    powderSizeConfigMap: {},
    defaultMilkPricePerMl: 40,
    milkPriceMap: {},
  }),
  resolveOrderItemPrice: vi.fn().mockReturnValue(69000),
  resolveOrderItemPremiumLatte: vi.fn().mockResolvedValue(0),
}));

// Mock lib/prisma — $transaction must be vi.fn() so tests can mockImplementation() per test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    menuItem: { findUnique: vi.fn() },
    addonOption: { findUnique: vi.fn() },
    order: { findUnique: vi.fn() },
    voucher: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { update: vi.fn() },
    pointsLog: { create: vi.fn() },
  },
}));

// Import AFTER mocks
import { POST, GET } from "@/app/api/orders/route";
import { prisma } from "@/lib/prisma";
import {
  resolveOrderItemPrice,
  resolveOrderItemPremiumLatte,
  buildPricingContext,
} from "@/lib/pricing";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Valid UUIDs — Zod v4 enforces strict UUID format
const ITEM_ID   = "550e8400-e29b-41d4-a716-446655440001";
const POWDER_ID = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID   = "550e8400-e29b-41d4-a716-446655440003";
const ORDER_ID  = "550e8400-e29b-41d4-a716-446655440004";
const V_PCT     = "550e8400-e29b-41d4-a716-446655440011";
const V_FIX     = "550e8400-e29b-41d4-a716-446655440012";
const V_MARK    = "550e8400-e29b-41d4-a716-446655440013";
const V_OTHER   = "550e8400-e29b-41d4-a716-446655440014";
const V_NONE    = "550e8400-e29b-41d4-a716-446655440015";
const V_USED    = "550e8400-e29b-41d4-a716-446655440016";
const V_EXP     = "550e8400-e29b-41d4-a716-446655440017";
const V_PROD    = "550e8400-e29b-41d4-a716-446655440018";
const OTHER_USER = "550e8400-e29b-41d4-a716-446655440099";

const validPayload = {
  order_type: "PICKUP",
  discount_voucher_ids: [],
  items: [
    {
      menu_item_id: ITEM_ID,
      quantity: 1,
      size: "L",
      sweetness: "QUARTER",
      addon_option_ids: [],
      client_price_vnd: 69000,
    },
  ],
};

const latteMenuItem = {
  id: ITEM_ID,
  name: "Trà Xanh Sữa",
  category: "latte",
  is_available: true,
  matcha_powder_id: POWDER_ID,
  default_powder_id: null,
  custom_powder_grams: null,
  fusionAllowedPowders: [],
  sizes: [{ size: "L", base_price_vnd: 55000 }],
};

const customerSession = { id: USER_ID, role: "CUSTOMER" };

const createdOrder = {
  id: "order-111",
  order_code: "BCBM-123456",
  order_type: "PICKUP",
  status: "PENDING",
  total_vnd: 69000,
  pickup_time: null,
  auto_cancel_at: new Date(),
};

function setupTx(overrides: {
  voucher?: object | null;
  menuItem?: object | null;
  orderResult?: object;
  addonOption?: object | null;
  addonVoucher?: object | null;
  productVoucher?: object | null;
} = {}) {
  mockVoucherFindUnique.mockReset();
  
  // Mock global prisma for reads outside transaction
  const mockMenuItemFind = vi.fn().mockResolvedValue(overrides.menuItem !== undefined ? overrides.menuItem : latteMenuItem);
  const mockAddonOptionFind = vi.fn().mockResolvedValue(overrides.addonOption !== undefined ? overrides.addonOption : null);
  
  (prisma.menuItem.findUnique as ReturnType<typeof vi.fn>) = mockMenuItemFind;
  (prisma.addonOption.findUnique as ReturnType<typeof vi.fn>) = mockAddonOptionFind;
  
  // Route now calls prisma.voucher.findUnique for ADDON, DISCOUNT, and PRODUCT vouchers.
  // Default is null (voucher not found). Tests that need specific values use
  // mockResolvedValueOnce() AFTER calling setupTx() to prepend to the call queue.
  if (overrides.voucher !== undefined) {
    mockVoucherFindUnique.mockResolvedValue(overrides.voucher);
  } else {
    mockVoucherFindUnique.mockResolvedValue(null);
  }
  mockVoucherUpdate.mockResolvedValue({});
  mockOrderCreate.mockResolvedValue(overrides.orderResult ?? createdOrder);

  const mockPrisma = prisma as unknown as {
    voucher: { findUnique: unknown; update: unknown };
    user: { update: unknown };
    pointsLog: { create: unknown };
    order: { findUnique: unknown; create: unknown };
  };

  mockPrisma.voucher = {
    findUnique: mockVoucherFindUnique,
    update: mockVoucherUpdate,
    updateMany: vi.fn().mockImplementation((args) => {
      const clonedArgs = { ...args, where: { ...args.where } };
      delete clonedArgs.where.status;
      mockVoucherUpdate(clonedArgs);
      return Promise.resolve({ count: 1 });
    }),
  };
  mockPrisma.user = {
    update: mockUserUpdate,
  };
  mockPrisma.pointsLog = {
    create: mockPointsLogCreate,
  };
  mockPrisma.order = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: mockOrderCreate,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      menuItem: { findUnique: mockMenuItemFind },
      addonOption: { findUnique: mockAddonOptionFind },
      voucher: {
        findUnique: mockVoucherFindUnique,
        update: mockVoucherUpdate,
        updateMany: vi.fn().mockImplementation((args) => {
          const clonedArgs = { ...args, where: { ...args.where } };
          delete clonedArgs.where.status;
          mockVoucherUpdate(clonedArgs);
          return Promise.resolve({ count: 1 });
        }),
      },
      user: { update: mockUserUpdate },
      pointsLog: { create: mockPointsLogCreate },
      order: { create: mockOrderCreate },
      orderDiscountVoucher: { create: vi.fn() },
      orderItemAddonVoucher: { createMany: vi.fn() },
    };
    return fn(tx);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock env vars for VietQR
    process.env.BANK_ID = "tcb";
    process.env.BANK_ACCOUNT = "13020283869";
    process.env.BANK_ACCOUNT_NAME = "HO MY TU UYEN";

    mockGetSession.mockResolvedValue(customerSession);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    mockSendPushToRoles.mockResolvedValue(undefined);
    // Restore pricing mocks cleared by clearAllMocks
    vi.mocked(buildPricingContext).mockResolvedValue({
      defaultSizeConfigs: [
        { size: "M" as const, milk_ml: 130, powder_gram: 3.5 },
        { size: "L" as const, milk_ml: 200, powder_gram: 4.5 },
        { size: "XL" as const, milk_ml: 300, powder_gram: 8.0 },
      ],
      powderPriceMap: {},
      powderSizeConfigMap: {},
      defaultMilkPricePerMl: 40,
      milkPriceMap: {},
    });
    vi.mocked(resolveOrderItemPrice).mockReturnValue(69000);
    vi.mocked(resolveOrderItemPremiumLatte).mockResolvedValue(0);

    mockCheckStoreOpen.mockResolvedValue({ is_open: true, reason: "OPEN", closure_note: null });
    mockValidatePickupTime.mockResolvedValue({ isValid: true });
  });

  // ── Auth & Role ────────────────────────────────────────────────────────────

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when role is STAFF", async () => {
    mockGetSession.mockResolvedValue({ id: "s", role: "STAFF" });
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("returns 403 when role is ADMIN", async () => {
    mockGetSession.mockResolvedValue({ id: "a", role: "ADMIN" });
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("returns 400 for malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/orders", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when items array is empty", async () => {
    const res = await POST(makeReq({ items: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when client_price_vnd is missing", async () => {
    const payload = {
      items: [{ menu_item_id: "x", quantity: 1, size: "L", sweetness: "QUARTER", addon_option_ids: [] }],
    };
    const res = await POST(makeReq(payload));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("creates PENDING order and returns 201", async () => {
    setupTx();
    const res = await POST(makeReq(validPayload));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe("order-111");
    expect(json.data.status).toBe("PENDING");
    expect(json.data.total_vnd).toBe(69000);
    expect(json.data.points_earned).toBeUndefined(); // not in response
  });

  it("order.create uses user_id from session, not body", async () => {
    setupTx();
    await POST(makeReq(validPayload));

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: USER_ID,
          status: "PENDING",
          points_earned: null,
        }),
      })
    );
  });

  it("passes pickup_time and note to order.create", async () => {
    setupTx();
    const payload = {
      ...validPayload,
      pickup_time: "2026-06-01T09:00:00.000Z",
      note: "Bớt đường giùm",
    };
    await POST(makeReq(payload));

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickup_time: new Date("2026-06-01T09:00:00.000Z"),
          note: "Bớt đường giùm",
        }),
      })
    );
  });

  it("defaults pickup_time to 10 minutes from now if PICKUP order and pickup_time missing", async () => {
    setupTx();
    vi.useFakeTimers();
    const now = new Date("2026-05-24T10:00:00.000Z");
    vi.setSystemTime(now);

    const payload = {
      ...validPayload,
      pickup_time: undefined, // Explicitly missing
    };

    await POST(makeReq(payload));

    const expectedPickupTime = new Date(now.getTime() + 10 * 60 * 1000);

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickup_time: expectedPickupTime,
        }),
      })
    );

    vi.useRealTimers();
  });

  // ── Voucher happy paths ────────────────────────────────────────────────────

  it("applies PERCENT discount voucher: 20% off 69000 = 56000 total (rounded to nearest 1000)", async () => {
    const voucher = {
      id: V_PCT,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "DISCOUNT",
      discount_type: "PERCENT",
      discount_value: 20,
      expires_at: null,
    };
    setupTx({ voucher });

    const res = await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_PCT] }));
    expect(res.status).toBe(201);

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal_vnd: 69000,
          discount_vnd: 13000,  // floor(69000 * 0.20 / 1000) * 1000
          total_vnd: 56000,
        }),
      })
    );
  });

  it("FIXED discount is capped at subtotal (total cannot go below 0)", async () => {
    const voucher = {
      id: V_FIX,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "DISCOUNT",
      discount_type: "FIXED",
      discount_value: 999999,
      expires_at: null,
    };
    setupTx({ voucher });

    await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_FIX] }));

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discount_vnd: 69000,  // capped at subtotal
          total_vnd: 0,
        }),
      })
    );
  });

  it("marks voucher RESERVED after order", async () => {
    const voucher = {
      id: V_MARK,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "DISCOUNT",
      discount_type: "FIXED",
      discount_value: 10000,
      expires_at: null,
    };
    setupTx({ voucher });
    await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_MARK] }));

    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: V_MARK },
        data: expect.objectContaining({
          status: "RESERVED",
        }),
      })
    );
  });

  // ── Voucher error paths ────────────────────────────────────────────────────

  it("returns 404 when voucher belongs to another user", async () => {
    setupTx({
      voucher: {
        id: V_OTHER, user_id: OTHER_USER, status: "ACTIVE",
        voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 5000, expires_at: null,
      },
    });
    const res = await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_OTHER] }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("returns 404 when voucher not found", async () => {
    setupTx({ voucher: null });
    const res = await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_NONE] }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("returns 422 VOUCHER_REDEEMED when already used", async () => {
    setupTx({
      voucher: {
        id: V_USED, user_id: USER_ID, status: "REDEEMED",
        voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 5000, expires_at: null,
      },
    });
    const res = await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_USED] }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VOUCHER_REDEEMED");
  });

  it("returns 422 VOUCHER_EXPIRED when past expires_at", async () => {
    setupTx({
      voucher: {
        id: V_EXP, user_id: USER_ID, status: "ACTIVE",
        voucher_type: "DISCOUNT", discount_type: "FIXED",
        discount_value: 5000, expires_at: new Date("2020-01-01"),
      },
    });
    const res = await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_EXP] }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VOUCHER_EXPIRED");
  });

  it("returns 400 when voucher is PRODUCT type", async () => {
    setupTx({
      voucher: {
        id: V_PROD, user_id: USER_ID, status: "ACTIVE",
        voucher_type: "PRODUCT", discount_type: null, discount_value: null, expires_at: null,
      },
    });
    const res = await POST(makeReq({ ...validPayload, discount_voucher_ids: [V_PROD] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  // ── Error propagation ──────────────────────────────────────────────────────

  it("returns 404 when item is unavailable (NOT_FOUND from processOrderItems)", async () => {
    setupTx({ menuItem: { ...latteMenuItem, is_available: false } });
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("returns 400 when size is unavailable (VALIDATION_ERROR from processOrderItems)", async () => {
    setupTx({
      menuItem: { ...latteMenuItem, sizes: [{ size: "L", base_price_vnd: null }] },
    });
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 PRICE_CHANGED when server price differs from client", async () => {
    // resolveOrderItemPrice returns 69000 but client sends 65000
    vi.mocked(resolveOrderItemPrice).mockReturnValue(90000); // price changed
    setupTx();

    const res = await POST(makeReq(validPayload)); // client_price_vnd = 69000
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("PRICE_CHANGED");
    expect(json.details.conflicts).toHaveLength(1);
    expect(json.details.conflicts[0].server_price_vnd).toBe(90000);
    expect(json.details.conflicts[0].client_price_vnd).toBe(69000);
  });

  it("returns 500 on unexpected DB error", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection timeout"));
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });

  // ── ADDON voucher ──────────────────────────────────────────────────────────

  const ADDON_VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440020";
  const ADDON_OPTION_ID  = "550e8400-e29b-41d4-a716-446655440021";

  it("applies ADDON voucher: reserves it and applies addon discount", async () => {
    const kemOption = {
      id: ADDON_OPTION_ID,
      label: "Kem",
      price_vnd: 8000,
      gram_value: null,
    };
    setupTx({ addonOption: kemOption });

    const addonVoucher = {
      id: ADDON_VOUCHER_ID,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "ADDON",
      addon_option_id: ADDON_OPTION_ID,
      expires_at: null,
    };
    // resolveOrderItemPrice returns 69000, addon = 8000 -> server total = 77000
    vi.mocked(resolveOrderItemPrice).mockReturnValue(69000);
    mockVoucherFindUnique
      .mockResolvedValueOnce(addonVoucher)
      .mockResolvedValue(null);

    const payload = {
      ...validPayload,
      items: [
        {
          menu_item_id: ITEM_ID,
          quantity: 1,
          size: "L",
          sweetness: "QUARTER",
          addon_option_ids: [{ option_id: ADDON_OPTION_ID, quantity: 1 }],
          client_price_vnd: 77000,
        },
      ],
    };

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(201);
  });

  it("reserves ADDON voucher in transaction", async () => {
    setupTx({ addonOption: { id: ADDON_OPTION_ID, label: "Kem", price_vnd: 8000 } });

    const addonVoucher2 = {
      id: ADDON_VOUCHER_ID,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "ADDON",
      addon_option_id: ADDON_OPTION_ID,
      expires_at: null,
    };
    mockVoucherFindUnique
      .mockResolvedValueOnce(addonVoucher2)
      .mockResolvedValue(null);

    await POST(makeReq({ ...validPayload, items: [{ ...validPayload.items[0], addon_option_ids: [{ option_id: ADDON_OPTION_ID, quantity: 1 }], addon_voucher_ids: [{ voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_OPTION_ID }] }] }));

    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ADDON_VOUCHER_ID },
        data: expect.objectContaining({ status: "RESERVED" }),
      })
    );
  });

  it("returns 422 when ADDON voucher is already REDEEMED", async () => {
    setupTx({ addonOption: { id: ADDON_OPTION_ID, label: "Kem", price_vnd: 8000 } });
    mockVoucherFindUnique.mockResolvedValueOnce({
      id: ADDON_VOUCHER_ID,
      user_id: USER_ID,
      status: "REDEEMED",
      voucher_type: "ADDON",
      addon_option_id: ADDON_OPTION_ID,
      expires_at: null,
    });

    const res = await POST(makeReq({ ...validPayload, items: [{ ...validPayload.items[0], addon_option_ids: [{ option_id: ADDON_OPTION_ID, quantity: 1 }], addon_voucher_ids: [{ voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_OPTION_ID }] }] }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VOUCHER_REDEEMED");
  });

  it("can stack ADDON + DISCOUNT vouchers in same order", async () => {
    setupTx({ addonOption: { id: ADDON_OPTION_ID, label: "Kem", price_vnd: 8000 } });

    const addonVoucher3 = {
      id: ADDON_VOUCHER_ID,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "ADDON",
      addon_option_id: ADDON_OPTION_ID,
      expires_at: null,
    };
    const discountVoucher2 = {
      id: V_PCT,
      user_id: USER_ID,
      status: "ACTIVE",
      voucher_type: "DISCOUNT",
      discount_type: "PERCENT",
      discount_value: 20,
      expires_at: null,
    };
    // Sequence of calls: ADDON lookup → DISCOUNT lookup → PRODUCT lookup (none)
    mockVoucherFindUnique
      .mockResolvedValueOnce(addonVoucher3)
      .mockResolvedValueOnce(discountVoucher2)
      .mockResolvedValue(null);

    const res = await POST(
      makeReq({
        ...validPayload,
        items: [{ ...validPayload.items[0], addon_option_ids: [{ option_id: ADDON_OPTION_ID, quantity: 1 }], addon_voucher_ids: [{ voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_OPTION_ID }] }],
        discount_voucher_ids: [V_PCT],
      })
    );
    expect(res.status).toBe(201);
    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADDON_VOUCHER_ID } })
    );
    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: V_PCT } })
    );
  });

  // ── Pickup Time & Store Closed ──────────────────────────────────────────────

  it("returns 503 when store is closed", async () => {
    setupTx();
    mockCheckStoreOpen.mockResolvedValue({ is_open: false, reason: "OUTSIDE_HOURS", closure_note: null });

    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("STORE_CLOSED");
    expect(json.error).toContain("đang đóng cửa");
  });

  it("returns 400 when pickup_time is invalid", async () => {
    setupTx();
    mockValidatePickupTime.mockResolvedValue({ isValid: false, error: "Thời gian nhận tối thiểu phải cách hiện tại 10 phút" });

    const res = await POST(
      makeReq({
        ...validPayload,
        pickup_time: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_PICKUP_TIME");
    expect(json.error).toBe("Thời gian nhận tối thiểu phải cách hiện tại 10 phút");
  });

  // ── Push notification trigger ──────────────────────────────────────────────

  it("gọi sendPushToRoles với ['ADMIN'] sau khi tạo order thành công", async () => {
    setupTx();
    mockSendPushToRoles.mockResolvedValue(undefined);

    const res = await POST(makeReq(validPayload));

    expect(res.status).toBe(201);
    expect(mockSendPushToRoles).toHaveBeenCalledWith(
      ["ADMIN"],
      expect.objectContaining({
        title: expect.stringContaining("Đơn hàng mới"),
        url: "/admin/orders",
      })
    );
    // Không truyền excludeUserId (customer order — không exclude ai)
    expect(mockSendPushToRoles).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object)
    );
  });

  it("không gọi sendPushToRoles khi order creation thất bại (PRICE_CHANGED)", async () => {
    vi.mocked(resolveOrderItemPrice).mockReturnValue(90000); // price mismatch
    setupTx();

    const res = await POST(makeReq(validPayload));

    expect(res.status).toBe(409);
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });
});


describe("GET /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(customerSession);
    mockVoucherFindUnique.mockResolvedValue(null);
    mockSendPushToRoles.mockResolvedValue(undefined); // Prevent .catch() from crashing on undefined

    // Mock $transaction to resolve array of promises for GET route
    (prisma.$transaction as any).mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    });

    (prisma.order as any) = {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    };
  });

  function makeGetReq(): NextRequest {
    return new NextRequest("http://localhost/api/orders", {
      method: "GET",
    });
  }

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("returns customer orders ordered by created_at desc", async () => {
    const mockOrders = [
      { id: "o1", user_id: USER_ID, created_at: "2026-05-01" },
      { id: "o2", user_id: USER_ID, created_at: "2026-05-02" },
    ];
    (prisma.order.findMany as any) = vi.fn().mockResolvedValue(mockOrders);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(
      mockOrders.map((o) => ({ ...o, payment_qr_url: null }))
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID },
        orderBy: { created_at: "desc" },
      })
    );
  });

  it("returns 500 on database error", async () => {
    (prisma.order.findMany as any) = vi.fn().mockRejectedValue(new Error("DB timeout"));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});
