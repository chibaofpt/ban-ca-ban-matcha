/**
 * Tests for the updated `orderService.ts` — specifically for the new
 * multi-voucher payload shape:
 *
 * Before (single-voucher):
 *   { voucher_id?: string, addon_voucher_ids?: string (order-level) }
 *
 * After (multi-voucher):
 *   { discount_voucher_ids: string[], items[].addon_voucher_ids?: string (per-item) }
 *
 * These tests will FAIL until orderService.ts is updated:
 *  - CreateOrderPayload.voucher_id  → discount_voucher_ids: string[]
 *  - CreateOrderPayload.addon_voucher_ids (order-level) → removed
 *  - CreateOrderPayload.items[].addon_voucher_ids → added (per-item)
 *  - createOrder options.voucherId → discountVoucherIds: string[]
 *  - createOrder options.addonVouchers → removed
 *  - buildPayloadItems → maps c.addonVouchers → addon_voucher_ids per item
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import { createOrder, PriceChangedError } from "@/src/services/orderService";
import type { CartItem } from "@/src/lib/types/cart";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
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
    quantityMap: {},
    addonsPrice: 0, addonPrices: {},
    quantityAddonOptions: [],
    clientPriceVnd: 55_000,
    originalClientPriceVnd: 55_000,
    ...overrides,
  };
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
    // Trường cũ không còn tồn tại
    expect("voucher_id" in payload).toBe(false);
    expect("addon_voucher_ids" in payload).toBe(false);
    // Trường mới
    expect(payload.discount_voucher_ids).toEqual([]);
  });
});

describe("createOrder — payload BUNDLE công khai", () => {
  beforeEach(() => vi.clearAllMocks());
  it("gửi qr_token và client_line_id ổn định cho allocation", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    await createOrder([makeCartItem({ cartId: "line-public-1", quantity: 2 })], {
      bundleVoucherQrToken: "bundle-public-token",
      bundleRewardAllocations: [{ client_line_id: "line-public-1", quantity: 1 }],
    });

    const payload = vi.mocked(apiClient.post).mock.calls[0]?.[1];
    expect(payload).toEqual(
      expect.objectContaining({
        bundle_voucher_qr_token: "bundle-public-token",
        bundle_reward_allocations: [{ client_line_id: "line-public-1", quantity: 1 }],
        items: [expect.objectContaining({ client_line_id: "line-public-1" })],
      }),
    );
  });
});

// ── Multi DISCOUNT vouchers (mới) ─────────────────────────────────────────────

describe("createOrder — discount_voucher_ids (thay thế voucher_id)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("1 discount voucher → discount_voucher_ids = [voucherId]", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart, { discountVoucherIds: ["dv-abc"] });

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.discount_voucher_ids).toEqual(["dv-abc"]);
  });

  it("nhiều discount vouchers → tất cả có trong discount_voucher_ids", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart, { discountVoucherIds: ["dv-1", "dv-2", "dv-3"] });

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.discount_voucher_ids).toHaveLength(3);
    expect((payload.discount_voucher_ids as string[])).toContain("dv-2");
  });

  it("discountVoucherIds rỗng → discount_voucher_ids = []", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart, { discountVoucherIds: [] });

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.discount_voucher_ids).toEqual([]);
  });

  it("không còn field voucher_id trong payload (breaking change)", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart, { discountVoucherIds: ["dv-abc"] });

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect("voucher_id" in payload).toBe(false);
  });
});

// ── Per-item ADDON voucher (mới) ──────────────────────────────────────────────

describe("createOrder — per-item addon_voucher_ids", () => {
  beforeEach(() => vi.clearAllMocks());

  it("item có addonVouchers → payload item chứa addon_voucher_ids", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [
      makeCartItem({
        selectedOptionIds: ["addon-kem-tuoi"],
        addonVouchers: [{ voucherId: "av-abc", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }],
        clientPriceVnd: 60_000,
      }),
    ];
    await createOrder(cart);

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as { items: Record<string, unknown>[] };
    expect(payload.items[0].addon_voucher_ids).toEqual([{ voucher_id: "av-abc", addon_option_id: "addon-kem-tuoi" }]);
  });

  it("item không có addonVouchers → addon_voucher_ids không có trong payload item", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem()];
    await createOrder(cart);

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as { items: Record<string, unknown>[] };
    expect("addon_voucher_ids" in payload.items[0]).toBe(false);
  });

  it("không còn addon_voucher_ids ở order-level (breaking change)", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem({ addonVouchers: [{ voucherId: "av-abc", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] })];
    await createOrder(cart);

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    // addon_voucher_ids không còn ở cấp order
    expect("addon_voucher_ids" in payload).toBe(false);
  });

  it("nhiều items — chỉ item có addonVouchers mới có field đó", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [
      makeCartItem({ cartId: "c1", menuItemId: "item-a", addonVouchers: [{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] }),
      makeCartItem({ cartId: "c2", menuItemId: "item-b" }), // không có addon voucher
    ];
    await createOrder(cart);

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as { items: Record<string, unknown>[] };
    expect(payload.items[0].addon_voucher_ids).toEqual([{ voucher_id: "av-1", addon_option_id: "addon-kem-tuoi" }]);
    expect("addon_voucher_ids" in payload.items[1]).toBe(false);
  });
});

// ── Per-item PRODUCT voucher (giữ nguyên, đảm bảo vẫn work) ──────────────────

describe("createOrder — product_voucher_id (per-item, không đổi)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("item có productVoucherId → product_voucher_id có trong payload item", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: mockOrderResult } });

    const cart = [makeCartItem({ productVoucherId: "pv-abc", clientPriceVnd: 5_000 })];
    await createOrder(cart);

    const payload = vi.mocked(apiClient.post).mock.calls[0][1] as { items: Record<string, unknown>[] };
    expect(payload.items[0].product_voucher_id).toBe("pv-abc");
    expect(payload.items[0].client_price_vnd).toBe(5_000);
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

    // Item A: PRODUCT voucher
    expect(payload.items[0].product_voucher_id).toBe("pv-1");
    expect(payload.items[0].client_price_vnd).toBe(5_000);
    expect("addon_voucher_ids" in payload.items[0]).toBe(false);

    // Item B: ADDON voucher
    expect(payload.items[1].addon_voucher_ids).toEqual([{ voucher_id: "av-1", addon_option_id: "addon-kem-tuoi" }]);
    expect("product_voucher_id" in payload.items[1]).toBe(false);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("createOrder — error handling (không thay đổi)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("409 PRICE_CHANGED → throw PriceChangedError", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: "PRICE_CHANGED",
          details: {
            conflicts: [
              {
                menu_item_id: "item-meyumi",
                name: "Meyumi",
                size: "SMALL",
                client_price_vnd: 55_000,
                server_price_vnd: 60_000,
              },
            ],
          },
        },
      },
    });

    const cart = [makeCartItem()];
    await expect(createOrder(cart)).rejects.toBeInstanceOf(PriceChangedError);
  });

  it("422 VOUCHER_REDEEMED → throw Error với message", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: { error: "Voucher has already been used", code: "VOUCHER_REDEEMED" },
      },
    });

    const cart = [makeCartItem()];
    await expect(createOrder(cart)).rejects.toThrow("Voucher has already been used");
  });
});

// ── CartItem type test — addonVouchers field must exist ──────────────────────

describe("CartItem type — addonVouchers field (mới thêm)", () => {
  it("CartItem có thể có addonVouchers (optional)", () => {
    // Test này verify TypeScript type đúng — nếu type không có field này sẽ bị lỗi
    const item: CartItem = makeCartItem({ addonVouchers: [{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] });
    expect(item.addonVouchers).toEqual([{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }]);
  });

  it("CartItem không có addonVouchers → undefined", () => {
    const item: CartItem = makeCartItem();
    expect(item.addonVouchers).toBeUndefined();
  });
});
