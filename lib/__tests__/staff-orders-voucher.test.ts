/**
 * Unit tests for POST /api/staff/orders — voucher + customer QR token verification.
 *
 * Strategy: reuse mock pattern from orders-route.test.ts.
 * Tests focus on the new QR-verification logic layered on top of the existing staff order route.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared BEFORE imports ────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockVoucherFindMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockCheckStoreOpen = vi.fn();
const mockMenuItemFindMany = vi.fn();
const mockMatchaPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockAddonOptionFindMany = vi.fn();

vi.mock("@/lib/auth", async (importOriginal) => {
  vi.stubEnv("JWT_SECRET", "hermetic-staff-voucher-test-secret-32chars");
  return { ...(await importOriginal<typeof import("@/lib/auth")>()), getSession: () => mockGetSession() };
});

vi.mock("@/lib/storeSchedule", () => ({
  checkStoreOpen: () => mockCheckStoreOpen(),
  validatePickupTime: vi.fn().mockResolvedValue({ isValid: true }),
}));

vi.mock("@/lib/redis", () => ({ getRedisClient: () => null }));

vi.mock("@/lib/logger", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    defaultSizeConfig: { findMany: vi.fn() },
    powderSizeConfig: { findMany: vi.fn() },
    menuItemSize: { findMany: vi.fn() },
    menuItem: {
      findUnique: vi.fn(),
      findMany: (...args: unknown[]) => mockMenuItemFindMany(...args),
    },
    matchaPowder: { findMany: (...args: unknown[]) => mockMatchaPowderFindMany(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    addonOption: {
      findUnique: vi.fn(),
      findMany: (...args: unknown[]) => mockAddonOptionFindMany(...args),
    },
    order: { findUnique: vi.fn(), create: vi.fn() },
    voucher: {
      findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args),
      findMany: (...args: unknown[]) => mockVoucherFindMany(...args),
      update: (...args: unknown[]) => mockVoucherUpdate(...args),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    voucherPackage: { findMany: vi.fn().mockResolvedValue([]) },
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
  sizes: [{ size: "MEDIUM", base_price_vnd: 55000, base_liquid_ml: 200 }],
};

const existingCustomer = { id: USER_ID, qr_token: QR_TOKEN, role: "CUSTOMER" };
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
  prisma.user.findUnique = vi.fn().mockResolvedValue(existingCustomer);
  prisma.voucher.findUnique = vi.fn().mockResolvedValue(null);

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
        defaultSizeConfig: prisma.defaultSizeConfig,
        powderSizeConfig: prisma.powderSizeConfig,
        menuItemSize: prisma.menuItemSize,
        matchaPowder: prisma.matchaPowder,
        milkType: prisma.milkType,
        voucherPackage: prisma.voucherPackage,
        menuItem: { findUnique: mockMenuItemFind, findMany: mockMenuItemFindMany },
        addonOption: { findUnique: mockAddonOptionFind, findMany: mockAddonOptionFindMany },
        voucher: {
          findUnique: mockVoucherFindUnique,
          findMany: mockVoucherFindMany,
          update: mockVoucherUpdate,
          updateMany: vi.fn().mockImplementation((args) => {
            mockVoucherUpdate(args);
            return Promise.resolve({ count: 1 });
          }),
        },
        user: { findUnique: mockUserFindUnique, update: mockUserUpdate, create: mockUserCreate },
        pointsLog: { create: mockPointsLogCreate },
        order: { create: mockOrderCreate, findUnique: vi.fn().mockResolvedValue(null) },
        orderDiscountVoucher: { create: vi.fn() },
        orderItemAddonVoucher: { createMany: vi.fn() },
      };
      return fn(tx);
    }
  );
  return { addonOption: mockAddonOptionFind };
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
    mockVoucherFindMany.mockResolvedValue([]);
    mockMenuItemFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: POWDER_ID, name: "Bột test", is_available: true, price_per_gram: 1200, reference_latte_item_id: null }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440099", is_default: true, is_active: true, price_per_ml: 40, display_order: 0 }]);
    mockAddonOptionFindMany.mockResolvedValue([]);

    vi.mocked(prisma.defaultSizeConfig.findMany).mockResolvedValue([
        { size: "SMALL" as const, milk_ml: 130, powder_gram: 3.5 },
        { size: "MEDIUM" as const, milk_ml: 200, powder_gram: 4.5 },
        { size: "LARGE" as const, milk_ml: 300, powder_gram: 8.0 },
    ] as never);
    vi.mocked(prisma.powderSizeConfig.findMany).mockResolvedValue([]);
    vi.mocked(prisma.menuItemSize.findMany).mockResolvedValue([]);
    setupTx();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("đọc giá và DISCOUNT từ transaction, giữ cùng mốc nhận qua P2034", async () => {
    setupTx();
    const entry = new Date("2026-09-04T10:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(entry);
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockVoucherFindUnique.mockResolvedValue({ ...discountVoucher, expires_at: new Date(entry.getTime() + 1000) });
    const globalLookup = vi.fn().mockResolvedValue(null);
    prisma.voucher.findUnique = globalLookup;
    prisma.menuItem.findUnique = vi.fn().mockResolvedValue({ ...latteMenuItem, sizes: [{ size: "MEDIUM", base_price_vnd: 90000 }] });
    const runTransaction = vi.mocked(prisma.$transaction).getMockImplementation()!;
    let attempt = 0;
    vi.mocked(prisma.$transaction).mockImplementation(async (...args: Parameters<typeof prisma.$transaction>) => {
      const result = await runTransaction(...args);
      if (++attempt === 1) {
        vi.setSystemTime(new Date(entry.getTime() + 2000));
        throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      }
      return result;
    });
    const response = await POST(makeReq(makePayload({ discount_voucher_ids: [VOUCHER_ID] })));
    expect(response.status).toBe(201);
    // ceil(55000 + 4.5 * 1200 + 200 * 40) = 69000; fixed voucher saves 10000.
    expect(mockOrderCreate).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ subtotal_vnd: 69000, total_vnd: 59000 }) }));
    expect(globalLookup).not.toHaveBeenCalled();
    expect(attempt).toBe(2);
  });

  it("ADDON áp dụng đúng option string đã chọn và không giảm giá nước", async () => {
    const tx = setupTx();
    const addonId = "550e8400-e29b-41d4-a716-446655440050";
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockVoucherFindUnique.mockResolvedValue({ ...discountVoucher, voucher_type: "ADDON", addon_option_id: addonId });
    tx.addonOption.mockResolvedValue({
      id: addonId, is_active: true, price_vnd: 5000, gram_value: null,
      group: { id: "addon-group", is_active: true, max_select: 1 },
    });
    const response = await POST(makeReq(makePayload({ items: [{
      ...baseItem, addon_option_ids: [addonId],
      addon_voucher_ids: [{ voucher_id: VOUCHER_ID, addon_option_id: addonId }],
    }] })));
    expect(response.status).toBe(201);
    expect(mockOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subtotal_vnd: 74000, total_vnd: 69000 }) }));
  });

  it("STAFF có DISCOUNT voucher, gửi đúng qr_token của khách → 201", async () => {
    setupTx();
    // For user lookup by phone
    mockUserFindUnique
      .mockResolvedValueOnce(existingCustomer)    // lookup by phone_number
      .mockResolvedValueOnce(existingCustomer);    // lookup by qr_token

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
      .mockResolvedValueOnce({ id: OTHER_USER_ID, qr_token: QR_TOKEN, role: "CUSTOMER" });

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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);             // public + legacy lookup → not found

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

  it("voucher còn hạn lúc nhận POST vẫn dùng được khi đồng hồ trôi trước lúc kiểm tra", async () => {
    setupTx();
    const acceptanceDate = new Date("2026-09-04T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(acceptanceDate);
    mockGetSession.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-09-04T10:00:02.000Z"));
      return ADMIN_SESSION;
    });
    mockVoucherFindUnique.mockResolvedValue({
      ...discountVoucher,
      expires_at: new Date("2026-09-04T10:00:01.000Z"),
    });

    const res = await POST(makeReq(makePayload({ discount_voucher_ids: [VOUCHER_ID] })));

    expect(res.status).toBe(201);
    expect(mockVoucherUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        expires_at: { lte: acceptanceDate },
      }),
    }));
  });

  it("voucher hết hạn đúng lúc nhận POST bị từ chối", async () => {
    setupTx();
    const acceptanceDate = new Date("2026-09-04T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(acceptanceDate);
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockVoucherFindUnique.mockResolvedValue({
      ...discountVoucher,
      expires_at: acceptanceDate,
    });

    const res = await POST(makeReq(makePayload({ discount_voucher_ids: [VOUCHER_ID] })));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VOUCHER_EXPIRED");
  });

  it("voucher đã hết hạn trước lúc nhận POST bị từ chối", async () => {
    setupTx();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T10:00:00.000Z"));
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockVoucherFindUnique.mockResolvedValue({
      ...discountVoucher,
      expires_at: new Date("2026-09-04T09:59:59.999Z"),
    });

    const res = await POST(makeReq(makePayload({ discount_voucher_ids: [VOUCHER_ID] })));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VOUCHER_EXPIRED");
  });

  it("BUNDLE còn hạn lúc nhận POST đi qua kiểm tra expiry bằng acceptanceDate", async () => {
    const acceptanceDate = new Date("2026-09-04T10:00:00.000Z");
    const lineId = "550e8400-e29b-41d4-a716-446655440040";
    const bundleQrToken = "550e8400-e29b-41d4-a716-446655440041";
    vi.useFakeTimers();
    vi.setSystemTime(acceptanceDate);
    mockGetSession.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-09-04T10:00:02.000Z"));
      return ADMIN_SESSION;
    });
    mockVoucherFindMany.mockResolvedValue([{
      id: VOUCHER_ID,
      qr_token: bundleQrToken,
      user_id: USER_ID,
      voucher_type: "BUNDLE",
      status: "ACTIVE",
      expires_at: new Date("2026-09-04T10:00:01.000Z"),
      package: {
        id: "550e8400-e29b-41d4-a716-446655440042",
        ends_at: null,
        min_order_vnd: null,
        bundleRule: {
          buy_quantity: 1,
          reward_quantity: 1,
          reward_kind: "PRODUCT",
          reward_mode: "SAME_CONFIG",
          benefit_scaling: "PER_BUNDLE",
          max_applications_order: 1,
          max_reward_units_order: null,
          productScopes: [{
            role: "QUALIFIER",
            menu_item_id: ITEM_ID,
            default_powder_id: POWDER_ID,
            default_base_liquid_id: "550e8400-e29b-41d4-a716-446655440099",
            sizes: [{ size: "MEDIUM" }],
          }],
          addonRewards: [],
        },
      },
    }]);

    const res = await POST(makeReq(makePayload({
      items: [{ ...baseItem, client_line_id: lineId, quantity: 2 }],
      bundle_applications: [{
        voucher_qr_token: bundleQrToken,
        qualifier_allocations: [{ client_line_id: lineId, quantity: 1 }],
        reward_allocations: [{ client_line_id: lineId, quantity: 1 }],
      }],
    })));

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "BUNDLE_VOUCHER_UNAVAILABLE" },
    });
  });
});
