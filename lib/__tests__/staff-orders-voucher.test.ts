/**
 * Unit tests for POST /api/staff/orders — voucher + customer QR token verification.
 *
 * Strategy: reuse mock pattern from orders-route.test.ts.
 * Tests focus on the new QR-verification logic layered on top of the existing staff order route.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared BEFORE imports ────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockCheckStoreOpen = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  normalizePhone: (p: string) => p,
}));

vi.mock("@/lib/storeSchedule", () => ({
  checkStoreOpen: () => mockCheckStoreOpen(),
  validatePickupTime: vi.fn().mockResolvedValue({ isValid: true }),
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
  }),
  resolveOrderItemPrice: vi.fn().mockReturnValue(69000),
  resolveOrderItemPremiumLatte: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/logger", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    menuItem: { findUnique: vi.fn() },
    addonOption: { findUnique: vi.fn() },
    order: { findUnique: vi.fn(), create: vi.fn() },
    voucher: {
      findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args),
      update: (...args: unknown[]) => mockVoucherUpdate(...args),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
    pointsLog: { create: (...args: unknown[]) => mockPointsLogCreate(...args) },
  },
}));

// Import AFTER mocks
import { POST } from "@/app/api/staff/orders/route";
import { prisma } from "@/lib/prisma";
import {
  resolveOrderItemPrice,
  resolveOrderItemPremiumLatte,
  buildPricingContext,
} from "@/lib/pricing";

// ── Constants ──────────────────────────────────────────────────────────────────

const ITEM_ID    = "550e8400-e29b-41d4-a716-446655440001";
const POWDER_ID  = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID    = "550e8400-e29b-41d4-a716-446655440003";
const OTHER_USER_ID = "550e8400-e29b-41d4-a716-446655440004";
const VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440011";
const QR_TOKEN   = "550e8400-e29b-41d4-a716-446655440020"; // customer's qr_token
const STAFF_SESSION = { id: "550e8400-e29b-41d4-a716-446655440030", role: "STAFF" };
const ADMIN_SESSION = { id: "550e8400-e29b-41d4-a716-446655440031", role: "ADMIN" };

const latteMenuItem = {
  id: ITEM_ID,
  name: "Trà Xanh Sữa",
  category: "latte",
  is_available: true,
  matcha_powder_id: POWDER_ID,
  default_powder_id: null,
  custom_powder_grams: null,
  fusionAllowedPowders: [],
  sizes: [{ size: "MEDIUM", base_price_vnd: 55000 }],
};

const existingCustomer = { id: USER_ID };
const discountVoucher = {
  id: VOUCHER_ID,
  user_id: USER_ID,
  status: "ACTIVE",
  voucher_type: "DISCOUNT",
  discount_type: "FIXED",
  discount_value: 10000,
  expires_at: null,
};

const baseItem = {
  menu_item_id: ITEM_ID,
  quantity: 1,
  size: "MEDIUM",
  sweetness: "HALF",
  addon_option_ids: [],
  client_price_vnd: 69000,
};

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    phone_number: "0912345678",
    items: [baseItem],
    discount_voucher_ids: [],
    ...overrides,
  };
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/staff/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Transaction setup helper ───────────────────────────────────────────────────

function setupTx() {
  const mockMenuItemFind = vi.fn().mockResolvedValue(latteMenuItem);
  const mockAddonOptionFind = vi.fn().mockResolvedValue(null);

  (prisma.menuItem.findUnique as ReturnType<typeof vi.fn>) = mockMenuItemFind;
  (prisma.addonOption.findUnique as ReturnType<typeof vi.fn>) = mockAddonOptionFind;
  (prisma.order.findUnique as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue(null);

  const createdOrder = {
    id: "order-staff-001",
    status: "COMPLETED",
    total_vnd: 69000,
    points_earned: 6,
  };
  mockOrderCreate.mockResolvedValue(createdOrder);

  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => unknown) => {
      const tx = {
        menuItem: { findUnique: mockMenuItemFind },
        addonOption: { findUnique: mockAddonOptionFind },
        voucher: {
          findUnique: mockVoucherFindUnique,
          update: mockVoucherUpdate,
          updateMany: vi.fn().mockImplementation((args) => {
            mockVoucherUpdate(args);
            return Promise.resolve({ count: 1 });
          }),
        },
        user: { findUnique: mockUserFindUnique, update: mockUserUpdate, create: mockUserCreate },
        pointsLog: { create: mockPointsLogCreate },
        order: { create: mockOrderCreate },
        orderDiscountVoucher: { create: vi.fn() },
        orderItemAddonVoucher: { createMany: vi.fn() },
      };
      return fn(tx);
    }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/staff/orders — voucher + QR token verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCheckStoreOpen.mockResolvedValue({ is_open: true, reason: "OPEN", closure_note: null });

    // By default, user exists, no QR lookup
    mockUserFindUnique.mockResolvedValue(existingCustomer);
    mockUserCreate.mockResolvedValue({ id: USER_ID });
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    mockVoucherFindUnique.mockResolvedValue(null);

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
    vi.mocked(resolveOrderItemPremiumLatte).mockResolvedValue(0);
  });

  it("STAFF có DISCOUNT voucher, gửi đúng qr_token của khách → 201", async () => {
    setupTx();
    // For user lookup by phone
    mockUserFindUnique
      .mockResolvedValueOnce(existingCustomer)    // lookup by phone_number
      .mockResolvedValueOnce({ id: USER_ID });    // lookup by qr_token

    mockVoucherFindUnique.mockResolvedValue(discountVoucher);
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    const payload = makePayload({
      discount_voucher_ids: [VOUCHER_ID],
      customer_qr_token: QR_TOKEN,
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(201);
  });

  it("STAFF có voucher nhưng thiếu customer_qr_token → 400 VALIDATION_ERROR", async () => {
    setupTx();
    // user found by phone
    mockUserFindUnique.mockResolvedValue(existingCustomer);
    mockVoucherFindUnique.mockResolvedValue(discountVoucher);
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    const payload = makePayload({
      discount_voucher_ids: [VOUCHER_ID],
      // customer_qr_token: deliberately omitted
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("STAFF gửi qr_token sai user (khách khác) → 400 VALIDATION_ERROR", async () => {
    setupTx();
    // phone lookup → existingCustomer (USER_ID)
    // qr_token lookup → returns OTHER_USER_ID — mismatch!
    mockUserFindUnique
      .mockResolvedValueOnce(existingCustomer)                    // phone lookup
      .mockResolvedValueOnce({ id: OTHER_USER_ID });              // qr_token lookup (different user)

    mockVoucherFindUnique.mockResolvedValue(discountVoucher);
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    const payload = makePayload({
      discount_voucher_ids: [VOUCHER_ID],
      customer_qr_token: QR_TOKEN, // QR belongs to OTHER_USER, not USER_ID
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("ADMIN có voucher, không gửi qr_token → 201 (auto bypass)", async () => {
    setupTx();
    mockUserFindUnique.mockResolvedValue(existingCustomer);
    mockVoucherFindUnique.mockResolvedValue(discountVoucher);
    mockGetSession.mockResolvedValue(ADMIN_SESSION);

    const payload = makePayload({
      discount_voucher_ids: [VOUCHER_ID],
      // No customer_qr_token — ADMIN bypasses
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(201);
  });

  it("đơn không có voucher, không cần qr_token → 201", async () => {
    setupTx();
    mockUserFindUnique.mockResolvedValue(existingCustomer);
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    const payload = makePayload({
      discount_voucher_ids: [],
      // No vouchers, no qr_token needed
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(201);
  });

  it("qr_token hợp lệ nhưng không tìm thấy user trong DB → 400 VALIDATION_ERROR", async () => {
    setupTx();
    // phone lookup succeeds (user exists)
    // qr_token lookup returns null (token not found)
    mockUserFindUnique
      .mockResolvedValueOnce(existingCustomer)  // phone lookup
      .mockResolvedValueOnce(null);             // qr_token lookup → not found

    mockVoucherFindUnique.mockResolvedValue(discountVoucher);
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    const payload = makePayload({
      discount_voucher_ids: [VOUCHER_ID],
      customer_qr_token: QR_TOKEN,
    });

    const res = await POST(makeReq(payload));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });
});
