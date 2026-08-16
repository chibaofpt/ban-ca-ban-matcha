import { describe, expect, it, vi } from "vitest";
import {
  resolveOrderBundle,
  type OrderBundleDatabase,
} from "@/lib/orderBundle";

const now = new Date("2026-08-12T00:00:00.000Z");
const qrToken = "44444444-4444-4444-8444-444444444444";
const lineId = "55555555-5555-4555-8555-555555555555";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-voucher-id",
    user_id: "user-1",
    voucher_type: "BUNDLE",
    status: "ACTIVE",
    expires_at: new Date("2026-08-20T00:00:00.000Z"),
    package: {
      id: "package-id",
      ends_at: new Date("2026-08-19T00:00:00.000Z"),
      min_order_vnd: null,
      bundleRule: {
        buy_quantity: 1,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "SAME_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_order: 1,
        max_reward_units_order: null,
        productScopes: [
          {
            role: "QUALIFIER",
            menu_item_id: "menu-1",
            size: null,
            matcha_powder_id: null,
            milk_type_id: null,
            reference_price_vnd: null,
          },
        ],
        addonRewards: [],
      },
    },
    ...overrides,
  };
}

function input() {
  return {
    qr_token: qrToken,
    voucher_owner_id: "user-1",
    now,
    items: [
      {
        client_line_id: lineId,
        product_voucher_id: undefined,
        addon_voucher_ids: [] as Array<{ voucher_id: string; addon_option_id: string }>,
      },
    ],
    resolved_items: [
      {
        menu_item_id: "menu-1",
        size: "SMALL" as const,
        selected_powder_id: "powder-1",
        selected_milk_type_id: "milk-1",
        unit_price_vnd: 45_000,
        quantity: 2,
        resolvedAddons: [],
      },
    ],
    reward_allocations: [{ client_line_id: lineId, quantity: 1 }],
  };
}

describe("resolve BUNDLE cho order", () => {
  it("tra voucher bằng qr_token công khai và trả discount theo đúng line", async () => {
    const findUnique = vi.fn().mockResolvedValue(record());
    const db = { voucher: { findUnique } } as unknown as OrderBundleDatabase;

    const result = await resolveOrderBundle(db, input());

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { qr_token: qrToken } }),
    );
    expect(result.line_discounts_vnd).toEqual([45_000]);
    expect(result.evaluation.application_count).toBe(1);
    expect(result.package_id).toBe("package-id");
  });

  it("không cho dùng voucher của khách khác", async () => {
    const db = {
      voucher: { findUnique: vi.fn().mockResolvedValue(record({ user_id: "user-2" })) },
    } as unknown as OrderBundleDatabase;

    await expect(resolveOrderBundle(db, input())).rejects.toMatchObject({
      reason: "BUNDLE_VOUCHER_NOT_FOUND",
    });
  });
});
