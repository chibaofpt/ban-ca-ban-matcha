import { describe, expect, it } from "vitest";
import { migrateCartState } from "@/src/lib/store/cartStore";
import { migrateStaffCartState } from "@/src/lib/store/staffCartStore";
import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";

const item: CartItem = {
  cartId: "line-1",
  menuItemId: "latte-1",
  name: "Latte",
  category: "latte",
  imageUrl: null,
  size: "MEDIUM",
  unitPrice: 45_000,
  quantity: 1,
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "",
  selectedOptionIds: [],
  addonsPrice: 0,
  addonPrices: {},
  clientPriceVnd: 45_000,
  originalClientPriceVnd: 45_000,
};

const application: CartBundleApplication = {
  voucher_qr_token: "bundle-1",
  owner_key: "customer:84901234567",
  qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
  reward_allocations: [],
  created_reward_effects: [],
  status: "READY",
};

describe("migrate cart BUNDLE state", () => {
  it("giữ application từ phiên bản 8 và buộc revalidation ở phiên bản 9", () => {
    const migrated = migrateCartState({ items: [item], bundleApplications: [application] }, 8);
    expect(migrated.bundleApplications).toEqual([{ ...application, status: "REVALIDATING" }]);
  });

  it("giữ application staff từ phiên bản 4 và buộc revalidation ở phiên bản 5", () => {
    const migrated = migrateStaffCartState({ items: [item], bundleApplications: [application] }, 4);
    expect(migrated.bundleApplications).toEqual([{ ...application, status: "REVALIDATING" }]);
  });
});
