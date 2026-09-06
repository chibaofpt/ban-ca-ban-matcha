import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockClosureFindFirst = vi.fn();
const mockScheduleFindMany = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockGlobalVoucherFindUnique = vi.fn();
const mockGlobalVoucherUpdateMany = vi.fn();
const mockTransaction = vi.fn();
const mockOrderCreate = vi.fn();
const mockVoucherClaim = vi.fn();
const mockTransactionExpiry = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/redis", () => ({ getRedisClient: () => null }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: () => undefined };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeTemporaryClosure: { findFirst: (...args: unknown[]) => mockClosureFindFirst(...args) },
    storeSchedule: { findMany: (...args: unknown[]) => mockScheduleFindMany(...args) },
    voucherPackage: { findMany: vi.fn().mockResolvedValue([]) },
    voucher: {
      findUnique: (...args: unknown[]) => mockGlobalVoucherFindUnique(...args),
      updateMany: (...args: unknown[]) => mockGlobalVoucherUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { POST } from "@/app/api/orders/route";
import { calculateCustomerOrderDiscounts } from "@/lib/customerOrderDiscounts";
import { resolveCustomerItemVouchers } from "@/lib/customerOrderItemVouchers";
import { customerOrderSchema } from "@/lib/validations/order";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440002";
const VOUCHER_TOKEN = "550e8400-e29b-41d4-a716-446655440003";
const VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440004";
const ENTRY = new Date("2026-09-07T03:00:00.000Z");

function request(overrides: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      order_type: "PICKUP",
      pickup_time: "2026-09-07T03:20:00.000Z",
      items: [{ menu_item_id: ITEM_ID, quantity: 1, size: null, addon_option_ids: [], client_price_vnd: 0, item_voucher_id: VOUCHER_TOKEN }],
      discount_voucher_ids: [],
      bundle_applications: [],
      ...overrides,
    }),
  });
}

function voucher(expiresAt: Date) {
  return {
    id: VOUCHER_ID, qr_token: VOUCHER_TOKEN, user_id: USER_ID, voucher_type: "ITEM", status: "ACTIVE", expires_at: expiresAt,
    menu_item_id: ITEM_ID, covered_price_vnd: null, product_discount_mode: null, eligible_sizes: [], reference_size: null,
    discount_type: null, discount_value: null, min_order_vnd: null, menuItemScopes: [],
  };
}

function transactionClient() {
  return {
    defaultSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    powderSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue([]) },
    milkType: { findMany: vi.fn().mockResolvedValue([]) },
    menuItemSize: { findMany: vi.fn().mockResolvedValue([]) },
    menuItem: { findUnique: vi.fn().mockResolvedValue({ id: ITEM_ID, name: "Bánh test", category: "extras", is_available: true, unit_price_vnd: 10_000 }) },
    addonOption: { findUnique: vi.fn() },
    voucher: {
      findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args),
      updateMany: (args: { data: { status: string } }) => args.data.status === "EXPIRED" ? mockTransactionExpiry(args) : mockVoucherClaim(args),
    },
    order: { findUnique: vi.fn().mockResolvedValue(null), create: (...args: unknown[]) => mockOrderCreate(...args) },
    orderDiscountVoucher: { create: vi.fn() },
    orderItemAddonVoucher: { createMany: vi.fn() },
  };
}

describe("POST /api/orders — acceptanceDate của voucher ITEM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(ENTRY);
    vi.stubEnv("BANK_ID", "970422");
    vi.stubEnv("BANK_ACCOUNT", "123456789");
    vi.stubEnv("BANK_ACCOUNT_NAME", "Test Store");
    mockGetSession.mockResolvedValue({ id: USER_ID, role: "CUSTOMER" });
    mockClosureFindFirst.mockResolvedValue(null);
    mockScheduleFindMany.mockResolvedValue([{ open_time: "08:00", close_time: "18:00", slot: 1 }]);
    mockGlobalVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockGlobalVoucherFindUnique.mockResolvedValue(null);
    mockVoucherClaim.mockResolvedValue({ count: 1 });
    mockTransactionExpiry.mockResolvedValue({ count: 0 });
    mockOrderCreate.mockResolvedValue({
      id: "order-1", order_code: "BCBM-TEST01", status: "PENDING", order_type: "PICKUP", payment_method: "BANK_TRANSFER",
      subtotal_vnd: 10_000, total_voucher_discount_vnd: 0, total_vnd: 0, shipping_fee_vnd: 0, freeship_discount_vnd: 0,
      grand_total_vnd: 0, pickup_time: new Date("2026-09-07T03:20:00.000Z"), auto_cancel_at: new Date("2026-09-07T03:20:00.000Z"), items: [],
    });
    mockTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation(transactionClient()));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("chấp nhận voucher còn hạn lúc vào request dù clock đã vượt hạn trong các bước sau", async () => {
    mockVoucherFindUnique.mockResolvedValue(voucher(new Date(ENTRY.getTime() + 1_000)));
    mockClosureFindFirst.mockImplementation(async () => {
      vi.setSystemTime(new Date(ENTRY.getTime() + 2_000));
      return null;
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mockGlobalVoucherUpdateMany).not.toHaveBeenCalled();
    expect(mockTransactionExpiry).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ expires_at: { lte: ENTRY } }) }));
    expect(mockVoucherClaim).toHaveBeenCalledWith(expect.objectContaining({ where: { id: VOUCHER_ID, status: "ACTIVE" } }));
  });

  it("từ chối voucher hết hạn đúng tại acceptanceDate", async () => {
    mockVoucherFindUnique.mockResolvedValue(voucher(ENTRY));

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("VOUCHER_EXPIRED");
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("từ chối voucher hết hạn trước acceptanceDate", async () => {
    mockVoucherFindUnique.mockResolvedValue(voucher(new Date(ENTRY.getTime() - 1)));

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("VOUCHER_EXPIRED");
  });

  it("giữ acceptanceDate qua retry P2034", async () => {
    mockVoucherFindUnique.mockResolvedValue(voucher(new Date(ENTRY.getTime() + 1_000)));
    let attempt = 0;
    mockTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
      attempt += 1;
      const result = await operation(transactionClient());
      if (attempt === 1) {
        vi.setSystemTime(new Date(ENTRY.getTime() + 2_000));
        throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      }
      return result;
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(attempt).toBe(2);
  });

  it("DISCOUNT dùng snapshot transaction và giữ acceptanceDate qua retry", async () => {
    mockVoucherFindUnique.mockResolvedValue({
      ...voucher(new Date(ENTRY.getTime() + 1_000)),
      voucher_type: "DISCOUNT", discount_type: "PERCENT", discount_value: 50, max_discount_vnd: 3_000,
    });
    let attempt = 0;
    mockTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
      const response = await operation(transactionClient());
      if (++attempt === 1) {
        vi.setSystemTime(new Date(ENTRY.getTime() + 2_000));
        throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      }
      return response;
    });
    const response = await POST(request({
      items: [{ menu_item_id: ITEM_ID, quantity: 1, size: null, addon_option_ids: [], client_price_vnd: 10_000 }],
      discount_voucher_ids: [VOUCHER_TOKEN],
    }));
    expect(response.status).toBe(201);
    expect(mockOrderCreate).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      subtotal_vnd: 10_000, total_voucher_discount_vnd: 3_000, total_vnd: 7_000,
    }) }));
    expect(mockGlobalVoucherFindUnique).not.toHaveBeenCalled();
    expect(attempt).toBe(2);
  });

  it("FREESHIP dùng snapshot transaction và mốc tiếp nhận dù clock đã vượt hạn", async () => {
    mockVoucherFindUnique.mockResolvedValue({
      ...voucher(new Date(ENTRY.getTime() + 1_000)),
      voucher_type: "FREESHIP",
      covered_delivery_fee_vnd: 15_000,
    });
    vi.setSystemTime(new Date(ENTRY.getTime() + 2_000));
    const data = customerOrderSchema.parse(await request({
      order_type: "DELIVERY",
      pickup_time: undefined,
      address_id: "550e8400-e29b-41d4-a716-446655440005",
      items: [{ menu_item_id: ITEM_ID, quantity: 1, size: null, addon_option_ids: [], client_price_vnd: 10_000 }],
      freeship_voucher_id: VOUCHER_TOKEN,
    }).json());

    const result = await calculateCustomerOrderDiscounts(
      data,
      USER_ID,
      [{
        menu_item_id: ITEM_ID, unit_price_vnd: 10_000, addons_price_vnd: 0,
        quantity: 1, line_total: 10_000, bundle_discount_vnd: 0,
        product_voucher_id: null, item_voucher_id: null,
        product_voucher_covered_vnd: 0, addon_vouchers: [],
      }],
      20_000,
      new Map(),
      transactionClient() as unknown as Parameters<typeof calculateCustomerOrderDiscounts>[5],
      ENTRY,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.freeshipVoucherId).toBe(VOUCHER_ID);
      expect(result.context.calculation.freeship_discount_vnd).toBe(15_000);
      expect(result.context.calculation.grand_total_vnd).toBe(15_000);
    }
    expect(mockGlobalVoucherFindUnique).not.toHaveBeenCalled();
  });

  it("claim voucher count=0 không được trả thành công", async () => {
    mockVoucherFindUnique.mockResolvedValue(voucher(new Date(ENTRY.getTime() + 60_000)));
    mockVoucherClaim.mockResolvedValue({ count: 0 });

    const response = await POST(request());

    expect(response.status).not.toBe(201);
    expect((await response.json()).code).toBe("CONFLICT");
  });

  it("lỗi voucher hiển thị tiếng Việt nguyên vẹn", async () => {
    const data = customerOrderSchema.parse(await request().json());
    data.items[0].product_voucher_id = VOUCHER_TOKEN;
    const duplicate = await resolveCustomerItemVouchers(data, USER_ID);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(await duplicate.response.json()).toMatchObject({ error: "Chỉ được gửi một loại voucher cho mỗi món" });
    delete data.items[0].product_voucher_id;
    delete data.items[0].item_voucher_id;
    data.items[0].addon_voucher_ids = [{ voucher_id: VOUCHER_TOKEN, addon_option_id: VOUCHER_ID }];
    const absent = await resolveCustomerItemVouchers(data, USER_ID);
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(await absent.response.json()).toMatchObject({ error: "Voucher áp dụng cho addon không có trong món nước" });
  });
});
