import { describe, expect, it, vi } from "vitest";
import { resolveOrderBundles, type OrderBundleDatabase } from "@/lib/orderBundle";

const now = new Date("2026-08-12T00:00:00.000Z");
const lineId = "55555555-5555-4555-8555-555555555555";
const lineId2 = "66666666-6666-4666-8666-666666666666";

function record(qrToken: string, menuId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `internal-${qrToken}`, qr_token: qrToken, user_id: "user-1", voucher_type: "BUNDLE",
    status: "ACTIVE", expires_at: new Date("2026-08-20T00:00:00.000Z"),
    package: { id: `package-${qrToken}`, ends_at: new Date("2026-08-19T00:00:00.000Z"), min_order_vnd: null,
      bundleRule: { buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT",
        reward_mode: "SAME_CONFIG", benefit_scaling: "PER_BUNDLE", max_applications_order: 1,
        max_reward_units_order: null, productScopes: [{ role: "QUALIFIER", menu_item_id: menuId,
          default_powder_id: "powder-1", default_base_liquid_id: "milk-1", sizes: [{ size: "SMALL" }] }],
        addonRewards: [] } },
    ...overrides,
  };
}

function input() {
  return {
    voucher_owner_id: "user-1", now,
    items: [lineId, lineId2].map((client_line_id) => ({ client_line_id,
      product_voucher_id: undefined, item_voucher_id: undefined,
      addon_voucher_ids: [] as Array<{ voucher_id: string; addon_option_id: string }> })),
    resolved_items: ["menu-1", "menu-2"].map((menu_item_id) => ({ menu_item_id, size: "SMALL" as const,
      selected_powder_id: "powder-1", selected_milk_type_id: "milk-1", unit_price_vnd: 45_000,
      quantity: 2, resolvedAddons: [] })),
    bundle_applications: [
      { voucher_qr_token: "voucher-1", qualifier_allocations: [{ client_line_id: lineId, quantity: 1 }],
        reward_allocations: [{ client_line_id: lineId, quantity: 1 }] },
      { voucher_qr_token: "voucher-2", qualifier_allocations: [{ client_line_id: lineId2, quantity: 1 }],
        reward_allocations: [{ client_line_id: lineId2, quantity: 1 }] },
    ],
  };
}

describe("resolve nhiều BUNDLE cho order", () => {
  it("batch token và cộng discount theo từng line", async () => {
    const findMany = vi.fn().mockResolvedValue([record("voucher-1", "menu-1"), record("voucher-2", "menu-2")]);
    const result = await resolveOrderBundles({ voucher: { findMany } } as OrderBundleDatabase, input());
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { qr_token: { in: ["voucher-1", "voucher-2"] } } }));
    expect(result.bundles).toHaveLength(2);
    expect(result.line_discounts_vnd).toEqual([45_000, 45_000]);
  });

  it("từ chối dùng trùng product unit giữa hai voucher", async () => {
    const request = input();
    request.bundle_applications[1]!.qualifier_allocations[0]!.client_line_id = lineId;
    request.bundle_applications[1]!.reward_allocations[0]!.client_line_id = lineId;
    await expect(resolveOrderBundles({ voucher: { findMany: vi.fn() } } as OrderBundleDatabase, request))
      .rejects.toMatchObject({ reason: "BUNDLE_ALLOCATION_OVERLAP" });
  });

  it("không cho dùng voucher của khách khác", async () => {
    const request = input();
    request.bundle_applications = request.bundle_applications.slice(0, 1);
    const foreign = record("voucher-1", "menu-1", { user_id: "user-2" });
    const db = { voucher: { findMany: vi.fn().mockResolvedValue([foreign]) } } as OrderBundleDatabase;
    await expect(resolveOrderBundles(db, request)).rejects.toMatchObject({ reason: "BUNDLE_VOUCHER_NOT_FOUND" });
  });
});
