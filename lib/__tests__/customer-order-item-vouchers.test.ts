import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerOrderInput } from "@/lib/validations/order";

const mockResolveOwnedVoucherIdentifier = vi.fn();

vi.mock("@/lib/publicIdentifiers", () => ({
  resolveOwnedVoucherIdentifier: (...args: unknown[]) => mockResolveOwnedVoucherIdentifier(...args),
}));

import { resolveCustomerItemVouchers } from "@/lib/orders/customerOrderItemVouchers";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const MENU_ITEM_ID = "550e8400-e29b-41d4-a716-446655440002";
const ITEM_TOKEN = "550e8400-e29b-41d4-a716-446655440003";
const ITEM_VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440004";
const ADDON_TOKEN = "550e8400-e29b-41d4-a716-446655440005";
const ADDON_VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440006";
const ADDON_OPTION_ID = "550e8400-e29b-41d4-a716-446655440007";
const ACCEPTANCE_DATE = new Date("2026-09-27T03:00:00.000Z");

function orderInput(): CustomerOrderInput {
  return {
    order_type: "PICKUP",
    items: [{
      menu_item_id: MENU_ITEM_ID,
      quantity: 1,
      size: null,
      sweetness: "FULL",
      ice_option: "NORMAL",
      coldwhisk: false,
      addon_option_ids: [ADDON_OPTION_ID],
      addon_voucher_ids: [{ voucher_id: ADDON_TOKEN, addon_option_id: ADDON_OPTION_ID }],
      item_voucher_id: ITEM_TOKEN,
      client_price_vnd: 0,
    }],
    discount_voucher_ids: [],
    bundle_applications: [],
  };
}

describe("resolveCustomerItemVouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("giữ nguyên response body/status cho lỗi validation trực tiếp", async () => {
    const data = orderInput();
    data.items[0].product_voucher_id = ADDON_TOKEN;

    const result = await resolveCustomerItemVouchers(data, USER_ID, undefined, ACCEPTANCE_DATE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toEqual({
        error: "Chỉ được gửi một loại voucher cho mỗi món",
        code: "VALIDATION_ERROR",
      });
    }
    expect(mockResolveOwnedVoucherIdentifier).not.toHaveBeenCalled();
  });

  it("trả context và thay token bằng id theo đúng thứ tự ITEM rồi ADDON", async () => {
    mockResolveOwnedVoucherIdentifier.mockImplementation(async (identifier: string) => {
      if (identifier === ITEM_TOKEN) {
        return {
          id: ITEM_VOUCHER_ID,
          user_id: USER_ID,
          qr_token: ITEM_TOKEN,
          voucher_type: "ITEM",
          status: "ACTIVE",
          expires_at: new Date("2026-10-01T00:00:00.000Z"),
          menu_item_id: MENU_ITEM_ID,
          covered_price_vnd: null,
          product_discount_mode: null,
          eligible_sizes: [],
          reference_size: null,
          discount_value: null,
          menuItemScopes: [{
            menu_item_id: MENU_ITEM_ID,
            size: null,
            matcha_powder_id: null,
            milk_type_id: null,
            covered_price_vnd: null,
          }],
          addonOptionScopes: [],
        };
      }
      return {
        id: ADDON_VOUCHER_ID,
        user_id: USER_ID,
        qr_token: ADDON_TOKEN,
        voucher_type: "ADDON",
        status: "ACTIVE",
        expires_at: new Date("2026-10-01T00:00:00.000Z"),
        addon_option_id: ADDON_OPTION_ID,
        menuItemScopes: [],
        addonOptionScopes: [{ addon_option_id: ADDON_OPTION_ID }],
      };
    });
    const data = orderInput();

    const result = await resolveCustomerItemVouchers(data, USER_ID, undefined, ACCEPTANCE_DATE);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.context.productVoucherMap.entries()]).toEqual([[
        ITEM_VOUCHER_ID,
        expect.objectContaining({ menu_item_id: MENU_ITEM_ID, voucher_type: "ITEM" }),
      ]]);
      expect([...result.context.addonVoucherMap.entries()]).toEqual([[ADDON_VOUCHER_ID, ADDON_OPTION_ID]]);
      expect([...result.context.addonVoucherIds]).toEqual([ADDON_VOUCHER_ID]);
      expect([...result.context.voucherQrTokens.entries()]).toEqual([
        [ITEM_VOUCHER_ID, ITEM_TOKEN],
        [ADDON_VOUCHER_ID, ADDON_TOKEN],
      ]);
    }
    expect(mockResolveOwnedVoucherIdentifier.mock.calls.map(([identifier]) => identifier)).toEqual([
      ITEM_TOKEN,
      ADDON_TOKEN,
    ]);
    expect(data.items[0].item_voucher_id).toBe(ITEM_VOUCHER_ID);
    expect(data.items[0].addon_voucher_ids[0].voucher_id).toBe(ADDON_VOUCHER_ID);
  });
});
