import { beforeEach, describe, expect, it } from "vitest";
import type { CartBundleApplication } from "@/src/lib/types/cart";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import { useStaffCartStore, migrateStaffCartState } from "@/src/lib/store/staffCartStore";
import { getBundleOutsideAddonQuantity, getBundleOutsideQuantity } from "@/src/lib/utils/bundleCartSummary";
import { normalizeStaffBundleApplications } from "@/src/lib/utils/staffBundlePayload";

const item = (cartId: string, quantity = 1, marker?: string) => projectedCartLine({
  cartId,
  menuItemId: "latte-1",
  name: "Latte",
  category: "latte",
  imageUrl: null,
  size: "MEDIUM",
  unitPrice: 45_000,
  quantity,
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "giữ ghi chú",
  selectedOptionIds: [],
  addonsPrice: 0,
  addonPrices: {},
  clientPriceVnd: 45_000,
  originalClientPriceVnd: 45_000,
  ...(marker ? { bundleRewardVoucherToken: marker } : {}),
});

const application = (token: string, ownerKey: string, effectLine: string): CartBundleApplication => ({
  voucher_qr_token: token,
  owner_key: ownerKey,
  qualifier_allocations: [{ client_line_id: "buy", quantity: 1 }],
  reward_allocations: [{ client_line_id: effectLine, quantity: 1 }],
  created_reward_effects: [{ kind: "LINE", client_line_id: effectLine }],
});

describe("staff BUNDLE parity contracts", () => {
  beforeEach(() => {
    useStaffCartStore.setState({ items: [], bundleApplications: [], customerInfo: null });
  });

  it("switches customer ownership and removes only the foreign generated effect", () => {
    useStaffCartStore.setState({
      items: [item("buy"), item("mine-effect", 1, "mine"), item("foreign-effect", 1, "foreign"), item("preexisting")],
      bundleApplications: [
        application("mine", "staff:customer-1", "mine-effect"),
        application("foreign", "staff:customer-2", "foreign-effect"),
      ],
    });

    useStaffCartStore.getState().reconcileBundleApplications("staff:customer-1");

    expect(useStaffCartStore.getState().bundleApplications.map((entry) => entry.voucher_qr_token)).toEqual(["mine"]);
    expect(useStaffCartStore.getState().items.map((entry) => entry.cartId)).toEqual(["buy", "mine-effect", "preexisting"]);
  });

  it("migration never trusts or persists a READY runtime status", () => {
    const migrated = migrateStaffCartState({
      items: [item("buy")],
      bundleApplications: [application("bundle", "staff:customer", "buy")],
    }, 4);

    expect(migrated.bundleApplications).toHaveLength(1);
    expect(migrated.bundleApplications?.[0]).not.toHaveProperty("status");
  });

  it("retains an invalid application for the same customer so the UI can repair it", () => {
    useStaffCartStore.setState({
      items: [item("buy"), item("reward")],
      bundleApplications: [application("bundle", "staff:customer", "reward")],
    });

    useStaffCartStore.getState().reconcileBundleApplications("staff:customer");

    expect(useStaffCartStore.getState().bundleApplications).toHaveLength(1);
    expect(useStaffCartStore.getState().bundleApplications[0]).not.toHaveProperty("status");
  });

  it("normalizes one READY app with allocations once and excludes invalid apps", () => {
    const normalized = normalizeStaffBundleApplications([
      application("ready", "staff:customer", "reward"),
      application("invalid", "staff:customer", "other"),
    ], new Set(["ready"]));

    expect(normalized).toEqual([{
      voucher_qr_token: "ready",
      qualifier_allocations: [{ client_line_id: "buy", quantity: 1 }],
      reward_allocations: [{ client_line_id: "reward", quantity: 1 }],
    }]);
    expect(normalized[0]).not.toHaveProperty("created_reward_effects");
    expect(normalized[0]).not.toHaveProperty("owner_key");
  });

  it("leaves outside units available for staff personal voucher selection", () => {
    const allocations = new Map([["mixed", 1]]);
    expect(getBundleOutsideQuantity({ cartId: "mixed", quantity: 3 }, allocations)).toBe(2);
    expect(getBundleOutsideQuantity({ cartId: "fully-allocated", quantity: 1 }, new Map([["fully-allocated", 1]]))).toBe(0);
    expect(getBundleOutsideAddonQuantity("line:addon", 1, new Map([["line:addon", 1]]))).toBe(0);
    expect(getBundleOutsideAddonQuantity("line:addon", 1, new Map())).toBe(1);
  });
});
