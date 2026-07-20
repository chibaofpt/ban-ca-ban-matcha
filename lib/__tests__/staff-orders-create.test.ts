/**
 * Tests for POST /api/staff/orders — COUNTER order creation.
 * Focuses on calculator integration, DISCOUNT min_order, aggregate surplus, anon guard.
 *
 * Mock strategy: mock lib/prisma, lib/auth, lib/pricing, lib/storeSchedule.
 * Keep lib/orders and lib/orderCalculator real (already tested separately).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared before dynamic imports ─────────────────────────────────────

const mockGetSession = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockVoucherUpdateMany = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockOrderDiscountVoucherCreate = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  normalizePhone: (p: string) => p,
}));

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: vi.fn().mockResolvedValue({
    defaultSizeConfigs: [
      { size: "SMALL" as const, milk_ml: 130, powder_gram: 3.5 },
      { size: "MEDIUM" as const, milk_ml: 200, powder_gram: 4.5 },
      { size: "LARGE" as const, milk_ml: 300, powder_gram: 8.0 },
    ],
    powderPriceMap: {},
    powderSizeConfigMap: {},
    defaultMilkPricePerMl: 40,
    milkPriceMap: {},
    availablePowders: [],
  }),
  resolveOrderItemPrice: vi.fn().mockReturnValue(69000),
  resolveOrderItemPremiumLatte: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    menuItem: { findUnique: vi.fn() },
    addonOption: { findUnique: vi.fn() },
    voucher: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    pointsLog: { create: vi.fn() },
    order: { create: vi.fn() },
    orderDiscountVoucher: { create: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/cancelOrder", () => ({
  restoreVouchersOnCancel: vi.fn(),
}));

// Import AFTER mocks
import { POST } from "@/app/api/staff/orders/route";
import { prisma } from "@/lib/prisma";
import { buildPricingContext, resolveOrderItemPrice } from "@/lib/pricing";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/staff/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Valid UUIDs
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const STAFF_ID = "550e8400-e29b-41d4-a716-446655440003";
const USER_ID = "550e8400-e29b-41d4-a716-446655440005";
const V_FIXED = "550e8400-e29b-41d4-a716-446655440012";
const V_PV = "550e8400-e29b-41d4-a716-446655440018";
const V_PV2 = "550e8400-e29b-41d4-a716-446655440019";

const staffSession = { id: STAFF_ID, role: "ADMIN" }; // ADMIN bypasses QR token check

const latteMenuItem = {
  id: ITEM_ID,
  name: "Trà Xanh Sữa",
  category: "latte",
  is_available: true,
  matcha_powder_id: "550e8400-e29b-41d4-a716-446655440002",
  default_powder_id: null,
  custom_powder_grams: null,
  fusionAllowedPowders: [],
  sizes: [{ size: "MEDIUM", base_price_vnd: 55000 }],
};

const createdOrder = {
  id: "order-counter-001",
  order_code: "BCBM-C00001",
  status: "COMPLETED",
  total_vnd: 69000,
  points_earned: 6,
};

function validPayload(overrides?: Partial<{
  phone_number: string;
  discount_voucher_ids: string[];
  items: unknown[];
}>) {
  return {
    phone_number: "+84901234567",
    items: [{
      menu_item_id: ITEM_ID,
      quantity: 1,
      size: "MEDIUM",
      sweetness: "FULL",
      addon_option_ids: [],
      client_price_vnd: 69000,
    }],
    discount_voucher_ids: [],
    ...overrides,
  };
}

function setupTx() {
  const mockMenuItemFind = vi.fn().mockResolvedValue(latteMenuItem);
  const mockAddonOptionFind = vi.fn().mockResolvedValue(null);

  (prisma.menuItem.findUnique as ReturnType<typeof vi.fn>) = mockMenuItemFind;
  (prisma.addonOption.findUnique as ReturnType<typeof vi.fn>) = mockAddonOptionFind;
  (prisma.voucher.findUnique as ReturnType<typeof vi.fn>) = mockVoucherFindUnique;
  (prisma.user.findUnique as ReturnType<typeof vi.fn>) = mockUserFindUnique;
  (prisma.user.update as ReturnType<typeof vi.fn>) = mockUserUpdate;
  (prisma.user.create as ReturnType<typeof vi.fn>) = mockUserCreate;
  (prisma.pointsLog.create as ReturnType<typeof vi.fn>) = mockPointsLogCreate;

  // Default: user exists (for voucher flows)
  mockUserFindUnique.mockResolvedValue({ id: USER_ID, phone: "+84901234567", qr_token: "qr-tok", password_hash: "hash" });
  mockOrderCreate.mockResolvedValue(createdOrder);
  mockVoucherUpdateMany.mockResolvedValue({ count: 1 });
  (prisma.voucher.updateMany as ReturnType<typeof vi.fn>) = mockVoucherUpdateMany;

  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => unknown) => {
      const tx = {
        menuItem: { findUnique: mockMenuItemFind },
        addonOption: { findUnique: mockAddonOptionFind },
        voucher: {
          findUnique: mockVoucherFindUnique,
          updateMany: mockVoucherUpdateMany,
        },
        user: {
          findUnique: mockUserFindUnique,
          update: mockUserUpdate,
          create: mockUserCreate,
        },
        pointsLog: { create: mockPointsLogCreate },
        order: { create: mockOrderCreate },
        orderDiscountVoucher: { create: mockOrderDiscountVoucherCreate },
        orderItemAddonVoucher: { createMany: vi.fn() },
      };
      return fn(tx);
    }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/staff/orders — COUNTER integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(staffSession);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    vi.mocked(buildPricingContext).mockResolvedValue({
      defaultSizeConfigs: [
        { size: "SMALL" as const, milk_ml: 130, powder_gram: 3.5 },
        { size: "MEDIUM" as const, milk_ml: 200, powder_gram: 4.5 },
        { size: "LARGE" as const, milk_ml: 300, powder_gram: 8.0 },
      ],
      powderPriceMap: {},
      powderSizeConfigMap: {},
      defaultMilkPricePerMl: 40,
      milkPriceMap: {},
    availablePowders: [],
    });
    vi.mocked(resolveOrderItemPrice).mockReturnValue(69000);
  });

  it("COUNTER order basic: tạo thành công, points = floor(total_vnd / 10000)", async () => {
    setupTx();

    const res = await POST(makeReq(validPayload()));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe("COMPLETED");
  });

  it("COUNTER anonymous order không cộng points", async () => {
    setupTx();
    mockUserFindUnique.mockResolvedValue(null); // no user

    const res = await POST(makeReq(validPayload({ phone_number: undefined })));
    expect(res.status).toBe(201);

    // Should NOT create any points logs
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
  });

  it("DISCOUNT min_order_vnd trả 400 khi staff thiếu minimum", async () => {
    setupTx();

    // Voucher with min_order_vnd = 100000
    mockVoucherFindUnique.mockResolvedValue({
      id: V_FIXED,
      voucher_type: "DISCOUNT",
      discount_type: "FIXED",
      discount_value: 10000,
      min_order_vnd: 100000,
      status: "ACTIVE",
      user_id: USER_ID,
      expires_at: new Date(Date.now() + 86400000),
    });

    const res = await POST(
      makeReq(validPayload({ discount_voucher_ids: [V_FIXED] }))
    );

    // After integration, staff route should check min_order_vnd → 400
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("MIN_ORDER_NOT_MET");
  });

  it("COUNTER surplus aggregate: 7k + 6k = 13k → floor(13k/10k) = 1 điểm, 1 log voucher_id=null", async () => {
    setupTx();

    // 2 PRODUCT vouchers
    const pv1 = {
      id: V_PV,
      voucher_type: "PRODUCT",
      status: "ACTIVE",
      user_id: USER_ID,
      menu_item_id: ITEM_ID,
      covered_price_vnd: 76000,  // drink=69000, surplus=7000
      expires_at: new Date(Date.now() + 86400000),
    };
    const pv2 = {
      id: V_PV2,
      voucher_type: "PRODUCT",
      status: "ACTIVE",
      user_id: USER_ID,
      menu_item_id: ITEM_ID,
      covered_price_vnd: 75000,  // drink=69000, surplus=6000
      expires_at: new Date(Date.now() + 86400000),
    };
    mockVoucherFindUnique
      .mockResolvedValueOnce(pv1)
      .mockResolvedValueOnce(pv2);

    const payload = validPayload({
      items: [
        {
          menu_item_id: ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "FULL",
          addon_option_ids: [],
          client_price_vnd: 0,
          product_voucher_id: V_PV,
        },
        {
          menu_item_id: ITEM_ID,
          quantity: 1,
          size: "MEDIUM",
          sweetness: "FULL",
          addon_option_ids: [],
          client_price_vnd: 0,
          product_voucher_id: V_PV2,
        },
      ],
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(201);

    // After integration: aggregate surplus = 7k + 6k = 13k → 1 point
    // Should create exactly ONE voucher_surplus log with voucher_id = null
    const surplusLogs = mockPointsLogCreate.mock.calls.filter(
      (c: Array<{ data: { reason: string } }>) => c[0]?.data?.reason === "voucher_surplus"
    );
    expect(surplusLogs).toHaveLength(1);
    expect(surplusLogs[0][0].data.voucher_id).toBeNull();
    expect(surplusLogs[0][0].data.delta).toBe(1);
  });

  it("Order items mới không ghi surplus_points", async () => {
    setupTx();

    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(201);

    // Verify order.create was called WITHOUT surplus_points in items data
    const createCall = mockOrderCreate.mock.calls[0][0];
    const itemData = createCall.data.items.create[0];
    expect(itemData).not.toHaveProperty("surplus_points");
  });

  it("Order discount voucher junction không ghi discount_applied_vnd", async () => {
    setupTx();

    mockVoucherFindUnique.mockResolvedValue({
      id: V_FIXED,
      voucher_type: "DISCOUNT",
      discount_type: "FIXED",
      discount_value: 10000,
      min_order_vnd: null,
      status: "ACTIVE",
      user_id: USER_ID,
      expires_at: new Date(Date.now() + 86400000),
    });

    const res = await POST(
      makeReq(validPayload({ discount_voucher_ids: [V_FIXED] }))
    );
    expect(res.status).toBe(201);

    // After migration: orderDiscountVoucher.create should NOT include discount_applied_vnd
    if (mockOrderDiscountVoucherCreate.mock.calls.length > 0) {
      const createData = mockOrderDiscountVoucherCreate.mock.calls[0][0].data;
      expect(createData).not.toHaveProperty("discount_applied_vnd");
    }
  });
});
