/** Outbound multi-voucher order payload and response contracts. */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import { createOrder } from "@/src/services/orderService";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeCartItem(overrides: Parameters<typeof projectedCartLine>[0] = {}) {
  return projectedCartLine({
    cartId: "cart-1",
    menuItemId: "item-meyumi",
    name: "Meyumi Matcha Latte",
    category: "latte",
    imageUrl: null,
    size: "SMALL",
    unitPrice: 55_000,
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    addonsPrice: 0, addonPrices: {},
    clientPriceVnd: 55_000,
    originalClientPriceVnd: 55_000,
    ...overrides,
  });
}

const mockOrderResult = {
  id: "order-uuid-1",
  order_code: "BCBM-001",
  status: "PENDING",
  order_type: "PICKUP",
  subtotal_vnd: 55_000,
  total_voucher_discount_vnd: 0,
  total_vnd: 55_000,
  shipping_fee_vnd: 0,
  freeship_discount_vnd: 0,
  grand_total_vnd: 55_000,
  pickup_time: null,
  auto_cancel_at: null,
  payment_qr_url: null,
  skipped_vouchers: [],
};

// ── Basic payload shape (no vouchers) ────────────────────────────────────────

describe("createOrder — payload shape without vouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi POST /api/orders với payload hợp lệ", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart);

    expect(apiClient.post).toHaveBeenCalledWith("/api/orders", expect.objectContaining({
      order_type: "PICKUP",
      items: expect.arrayContaining([
        expect.objectContaining({ menu_item_id: "item-meyumi" }),
      ]),
    }));
  });

  it("payload không có voucher → discount_voucher_ids là mảng rỗng", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart);

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.discount_voucher_ids).toEqual([]);
  });
});

describe("createOrder — payload BUNDLE công khai", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gửi application gồm qualifier/reward và không gửi field legacy", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    await createOrder([makeCartItem({ cartId: "line-public-1", quantity: 2 })], {
      bundleApplications: [{
        voucher_qr_token: "bundle-public-token",
        qualifier_allocations: [{ client_line_id: "line-public-1", quantity: 1 }],
        reward_allocations: [{ client_line_id: "line-public-1", quantity: 1 }],
      }],
    });

    const payload = vi.mocked(apiClient.post).mock.calls[0]?.[1];
    expect(payload).toEqual(
      expect.objectContaining({
        bundle_applications: [{
          voucher_qr_token: "bundle-public-token",
          qualifier_allocations: [{ client_line_id: "line-public-1", quantity: 1 }],
          reward_allocations: [{ client_line_id: "line-public-1", quantity: 1 }],
        }],
        items: [expect.objectContaining({ client_line_id: "line-public-1" })],
      }),
    );
    expect(payload).not.toHaveProperty("bundle_voucher_qr_token");
    expect(payload).not.toHaveProperty("bundle_reward_allocations");
  });
});

// ── Multi DISCOUNT vouchers ───────────────────────────────────────────────────

describe("createOrder — discount_voucher_ids (thay thế voucher_id)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nhiều discount vouchers → tất cả có trong discount_voucher_ids", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart, { discountVoucherIds: ["dv-1", "dv-2", "dv-3"] });

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.discount_voucher_ids).toEqual(["dv-1", "dv-2", "dv-3"]);
  });
});

// ── Mixed scenario ────────────────────────────────────────────────────────────

describe("createOrder — full mixed scenario", () => {
  beforeEach(() => vi.clearAllMocks());

  it("item A có PRODUCT voucher + item B có ADDON voucher + 2 DISCOUNT vouchers", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [
      makeCartItem({
        cartId: "c1",
        menuItemId: "item-meyumi",
        productVoucherId: "pv-1",
        clientPriceVnd: 5_000,
      }),
      makeCartItem({
        cartId: "c2",
        menuItemId: "item-shiro",
        selectedOptionIds: ["addon-kem-tuoi"],
        addonVouchers: [{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }],
        clientPriceVnd: 60_000,
      }),
    ];

    await createOrder(cart, {
      discountVoucherIds: ["dv-fixed-1", "dv-percent-1"],
      pickupTime: "2026-06-01T09:00:00.000Z",
    });

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as {
      discount_voucher_ids: string[];
      items: Record<string, unknown>[];
    };

    // Order-level discounts
    expect(payload.discount_voucher_ids).toEqual(["dv-fixed-1", "dv-percent-1"]);
    expect(payload).not.toHaveProperty("voucher_id");
    expect(payload).not.toHaveProperty("addon_voucher_ids");

    // Item A: PRODUCT voucher
    expect(payload.items[0].product_voucher_id).toBe("pv-1");
    expect(payload.items[0].client_price_vnd).toBe(5_000);
    expect("addon_voucher_ids" in payload.items[0]).toBe(false);

    // Item B: ADDON voucher
    expect(payload.items[1].addon_voucher_ids).toEqual([{ voucher_id: "av-1", addon_option_id: "addon-kem-tuoi" }]);
    expect("product_voucher_id" in payload.items[1]).toBe(false);
  });
});

// ── CartItem type test — addonVouchers field must exist ──────────────────────

describe("CartItem type — minimal addon voucher links", () => {
  it("normalizes one addon voucher to token + target only", () => {
    const item = makeCartItem({ addonVouchers: [{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] });
    expect(item.addonVouchers).toEqual([{ token: "av-1", voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountAmount: 0 }]);
  });

  it("CartItem không có addon voucher dùng mảng rỗng ổn định", () => {
    const item = makeCartItem();
    expect(item.addonVouchers).toEqual([]);
  });
});

describe("createOrder — bundle payload và skipped_vouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả skipped_vouchers trong kết quả thành công", async () => {
    const result = { ...mockOrderResult, skipped_vouchers: ["bundle-token-skipped"] };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: result } });

    const cart = [makeCartItem()];
    const order = await createOrder(cart);
    expect(order.skipped_vouchers).toEqual(["bundle-token-skipped"]);
  });

  it("gửi 2 bundle applications trong cùng một đơn", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    await createOrder(
      [makeCartItem({ cartId: "line-a", quantity: 2 }), makeCartItem({ cartId: "line-b", quantity: 2 })],
      {
        bundleApplications: [
          {
            voucher_qr_token: "bundle-token-1",
            qualifier_allocations: [{ client_line_id: "line-a", quantity: 2 }],
            reward_allocations: [{ client_line_id: "line-a", quantity: 1 }],
          },
          {
            voucher_qr_token: "bundle-token-2",
            qualifier_allocations: [{ client_line_id: "line-b", quantity: 2 }],
            reward_allocations: [{ client_line_id: "line-b", quantity: 1 }],
          },
        ],
      },
    );

    const payload = vi.mocked(apiClient.post).mock.calls[0]?.[1] as Record<string, unknown>;
    const apps = payload.bundle_applications as unknown[];
    expect(apps).toHaveLength(2);
    expect(apps[0]).toMatchObject({ voucher_qr_token: "bundle-token-1" });
    expect(apps[1]).toMatchObject({ voucher_qr_token: "bundle-token-2" });
  });
});
