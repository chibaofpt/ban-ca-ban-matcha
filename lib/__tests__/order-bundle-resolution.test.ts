import { describe, expect, it, vi } from "vitest";
const resolveBundleBaselineProducts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pricing", () => ({ resolveBundleBaselineProducts }));
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

function database(vouchers: unknown[]): OrderBundleDatabase {
  return {
    voucher: { findMany: vi.fn().mockResolvedValue(vouchers) },
    menuItem: { findMany: vi.fn().mockResolvedValue([
      ...["menu-1", "menu-2"].map((id) => ({
        id, name: id, category: "fusion", is_available: true, unit_price_vnd: null,
        matcha_powder_id: null, default_powder_id: "powder-1", default_base_liquid_id: "milk-1",
        sizes: [{ size: "SMALL", base_price_vnd: 45_000 }], allowedBaseLiquids: [],
      })),
    ]) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue([{ id: "powder-1", name: "Meyumi", price_per_gram: 1, is_available: true }]) },
    milkType: { findMany: vi.fn().mockResolvedValue([{ id: "milk-1", is_active: true, is_default: true, display_order: 0 }]) },
    addonOption: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("resolve nhiều BUNDLE cho order", () => {
  it("batch token và cộng discount theo từng line", async () => {
    const findMany = vi.fn().mockResolvedValue([record("voucher-1", "menu-1"), record("voucher-2", "menu-2")]);
    const db = database([]);
    db.voucher.findMany = findMany;
    const result = await resolveOrderBundles(db, input());
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { qr_token: { in: ["voucher-1", "voucher-2"] } } }));
    expect(result.bundles).toHaveLength(2);
    expect(result.line_discounts_vnd).toEqual([45_000, 45_000]);
  });

  it("từ chối dùng trùng product unit giữa hai voucher", async () => {
    const request = input();
    request.bundle_applications[1]!.qualifier_allocations[0]!.client_line_id = lineId;
    request.bundle_applications[1]!.reward_allocations[0]!.client_line_id = lineId;
    await expect(resolveOrderBundles(database([]), request))
      .rejects.toMatchObject({ reason: "BUNDLE_ALLOCATION_OVERLAP" });
  });

  it("không cho dùng voucher của khách khác", async () => {
    const request = input();
    request.bundle_applications = request.bundle_applications.slice(0, 1);
    const foreign = record("voucher-1", "menu-1", { user_id: "user-2" });
    const db = database([foreign]);
    await expect(resolveOrderBundles(db, request)).rejects.toMatchObject({ reason: "BUNDLE_VOUCHER_NOT_FOUND" });
  });

  it("chặn checkout khi qualifier cuối cùng vừa bị ngưng bán", async () => {
    const request = input();
    request.bundle_applications = request.bundle_applications.slice(0, 1);
    const db = database([record("voucher-1", "menu-1")]);
    db.menuItem.findMany = vi.fn().mockResolvedValue([]);
    await expect(resolveOrderBundles(db, request)).rejects.toMatchObject({ reason: "BUNDLE_VOUCHER_UNAVAILABLE" });
  });

  it("resolve baseline một batch cho nhiều BUNDLE thay vì N+1", async () => {
    const vouchers = [record("voucher-1", "menu-1"), record("voucher-2", "menu-2")];
    for (const voucher of vouchers) {
      voucher.package.bundleRule.reward_mode = "FIXED_CONFIG";
      voucher.package.bundleRule.productScopes.push({
        role: "REWARD", menu_item_id: voucher.package.bundleRule.productScopes[0]!.menu_item_id,
        default_powder_id: "powder-1", default_base_liquid_id: "milk-1", sizes: [{ size: "SMALL" }],
      });
    }
    resolveBundleBaselineProducts.mockImplementation(async (_db: unknown, products: unknown[]) => products.map((product) => ({
      ...(product as object), baseline_prices_vnd: { SMALL: 45_000 },
    })));
    await resolveOrderBundles(database(vouchers), input());
    expect(resolveBundleBaselineProducts).toHaveBeenCalledTimes(1);
    expect(resolveBundleBaselineProducts.mock.calls[0]?.[1]).toHaveLength(2);
  });
});
