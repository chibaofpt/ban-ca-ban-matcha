import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockUserFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockGenerateOrderCode = vi.fn();
const mockBuildVietQRUrl = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  normalizePhone: (phone: string) => phone,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/logger", () => ({ logSystemEvent: vi.fn() }));
vi.mock("@/lib/cancelOrder", () => ({ restoreVouchersOnCancel: vi.fn() }));
vi.mock("@/lib/orderCode", () => ({
  generateOrderCode: (...args: unknown[]) => mockGenerateOrderCode(...args),
}));
vi.mock("@/lib/vietqr", () => ({
  buildVietQRUrl: (...args: unknown[]) => mockBuildVietQRUrl(...args),
}));

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: vi.fn().mockResolvedValue({
    defaultSizeConfigs: [
      { size: "SMALL", milk_ml: 130, powder_gram: 3.5 },
      { size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 },
      { size: "LARGE", milk_ml: 300, powder_gram: 8 },
    ],
    powderPriceMap: {},
    powderSizeConfigMap: {},
    defaultMilkPricePerMl: 40,
    milkPriceMap: {},
    availablePowders: [],
  }),
  resolveOrderItemPrice: vi.fn().mockReturnValue(69_000),
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
    order: { create: vi.fn(), findUnique: vi.fn() },
    orderDiscountVoucher: { create: vi.fn() },
  },
}));

import { POST } from "@/app/api/staff/orders/route";
import { prisma } from "@/lib/prisma";
import { resolveOrderItemPrice } from "@/lib/pricing";
import { staffOrderSchema } from "@/lib/validations/order";

const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const STAFF_ID = "550e8400-e29b-41d4-a716-446655440003";
const USER_ID = "550e8400-e29b-41d4-a716-446655440005";
const ORDER_CODE = "BCBM-PAY001";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/staff/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePayload(paymentMethod?: "CASH" | "BANK_TRANSFER") {
  return {
    phone_number: "+84901234567",
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    items: [
      {
        menu_item_id: ITEM_ID,
        quantity: 1,
        size: "MEDIUM",
        sweetness: "FULL",
        addon_option_ids: [],
        client_price_vnd: 69_000,
      },
    ],
  };
}

function setupDatabase(): void {
  const menuItemFindUnique = vi.fn().mockResolvedValue({
    id: ITEM_ID,
    name: "Trà Xanh Sữa",
    category: "latte",
    is_available: true,
    matcha_powder_id: "550e8400-e29b-41d4-a716-446655440002",
    default_powder_id: null,
    custom_powder_grams: null,
    fusionAllowedPowders: [],
    sizes: [{ size: "MEDIUM", base_price_vnd: 55_000 }],
  });
  const addonOptionFindUnique = vi.fn().mockResolvedValue(null);
  const voucherFindUnique = vi.fn().mockResolvedValue(null);
  const voucherUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const userCreate = vi.fn();
  const orderDiscountVoucherCreate = vi.fn();

  mockUserFindUnique.mockResolvedValue({ id: USER_ID });
  mockOrderCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: "order-payment-001",
    status: args.data.status ?? "PENDING",
    order_type: args.data.order_type ?? "COUNTER",
    payment_method: args.data.payment_method ?? "CASH",
    order_code: args.data.order_code ?? null,
    auto_cancel_at: args.data.auto_cancel_at ?? null,
    subtotal_vnd: 69_000,
    total_voucher_discount_vnd: 0,
    total_vnd: 69_000,
    shipping_fee_vnd: 0,
    freeship_discount_vnd: 0,
    grand_total_vnd: 69_000,
    points_earned: args.data.points_earned ?? null,
  }));

  (prisma.menuItem.findUnique as ReturnType<typeof vi.fn>) = menuItemFindUnique;
  (prisma.addonOption.findUnique as ReturnType<typeof vi.fn>) = addonOptionFindUnique;
  (prisma.voucher.findUnique as ReturnType<typeof vi.fn>) = voucherFindUnique;
  (prisma.voucher.updateMany as ReturnType<typeof vi.fn>) = voucherUpdateMany;
  (prisma.user.findUnique as ReturnType<typeof vi.fn>) = mockUserFindUnique;
  (prisma.user.update as ReturnType<typeof vi.fn>) = mockUserUpdate;
  (prisma.user.create as ReturnType<typeof vi.fn>) = userCreate;
  (prisma.pointsLog.create as ReturnType<typeof vi.fn>) = mockPointsLogCreate;
  (prisma.order.create as ReturnType<typeof vi.fn>) = mockOrderCreate;

  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        menuItem: { findUnique: menuItemFindUnique },
        addonOption: { findUnique: addonOptionFindUnique },
        voucher: { findUnique: voucherFindUnique, updateMany: voucherUpdateMany },
        user: { findUnique: mockUserFindUnique, update: mockUserUpdate, create: userCreate },
        pointsLog: { create: mockPointsLogCreate },
        order: { create: mockOrderCreate },
        orderDiscountVoucher: { create: orderDiscountVoucherCreate },
        orderItemAddonVoucher: { createMany: vi.fn() },
      }),
  );
}

describe("staffOrderSchema — phương thức thanh toán", () => {
  it("payload cũ không gửi payment_method vẫn mặc định CASH", () => {
    const result = staffOrderSchema.parse(makePayload());
    expect(result.payment_method).toBe("CASH");
  });

  it("chấp nhận BANK_TRANSFER", () => {
    const result = staffOrderSchema.parse(makePayload("BANK_TRANSFER"));
    expect(result.payment_method).toBe("BANK_TRANSFER");
  });

  it("từ chối giá trị ngoài enum", () => {
    expect(() => staffOrderSchema.parse({ ...makePayload(), payment_method: "CARD" })).toThrow();
  });
});

describe("POST /api/staff/orders — phương thức thanh toán", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: STAFF_ID, role: "ADMIN" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSeconds: 0 });
    mockGenerateOrderCode.mockResolvedValue(ORDER_CODE);
    mockBuildVietQRUrl.mockReturnValue("https://img.vietqr.io/payment.jpg");
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupDatabase();
  });

  it("giữ nguyên luồng CASH: tạo COMPLETED và cộng điểm ngay", async () => {
    const response = await POST(makeRequest(makePayload()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          payment_method: "CASH",
          order_code: null,
          auto_cancel_at: null,
        }),
      }),
    );
    expect(body.data).toMatchObject({
      status: "COMPLETED",
      payment_method: "CASH",
      payment_qr_url: null,
    });
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it("BANK_TRANSFER tạo PENDING với mã đơn, QR và chưa cộng điểm", async () => {
    const response = await POST(makeRequest(makePayload("BANK_TRANSFER")));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          payment_method: "BANK_TRANSFER",
          order_code: ORDER_CODE,
          points_earned: null,
        }),
      }),
    );
    expect(body.data).toMatchObject({
      status: "PENDING",
      payment_method: "BANK_TRANSFER",
      order_code: ORDER_CODE,
      payment_qr_url: "https://img.vietqr.io/payment.jpg",
    });
    expect(body.data.auto_cancel_at).toBeTruthy();
    expect(mockBuildVietQRUrl).toHaveBeenCalledWith({ amount: 69_000, orderCode: ORDER_CODE });
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
  });

  it("không ghi đơn BANK_TRANSFER nếu không tạo được VietQR", async () => {
    mockBuildVietQRUrl.mockImplementation(() => {
      throw new Error("Missing bank config");
    });

    const response = await POST(makeRequest(makePayload("BANK_TRANSFER")));

    expect(response.status).toBe(500);
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("từ chối BANK_TRANSFER khi tổng server bằng 0đ", async () => {
    vi.mocked(resolveOrderItemPrice).mockReturnValueOnce(0);
    const payload = makePayload("BANK_TRANSFER");
    payload.items[0].client_price_vnd = 0;

    const response = await POST(makeRequest(payload));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ZERO_TOTAL_BANK_TRANSFER" },
    });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });
});
