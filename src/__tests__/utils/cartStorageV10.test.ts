import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeCartStorage, migrateCustomerCartState, migrateStaffCartState } from "@/src/lib/store/cartStorage";
import { useCartStore } from "@/src/lib/store/cartStore";

afterEach(() => vi.unstubAllGlobals());

describe("cartStorage v10/v6", () => {
  it("migrate customer loại snapshot và giữ voucher/BUNDLE selection", () => {
    const migrated = migrateCustomerCartState({
      items: [{
        cartId: "line-1", menuItemId: "drink-1", quantity: 1,
        name: "Legacy", imageUrl: "/legacy.jpg", category: "fusion",
        size: "MEDIUM", sweetness: "HALF", iceOption: "LESS_ICE", coldwhisk: true, note: "x",
        selectedOptionIds: ["addon-1"], selectedMilkTypeId: "milk-1",
        unitPrice: 55_000, addonsPrice: 5_000, addonPrices: { "addon-1": 5_000 },
        clientPriceVnd: 50_000, originalClientPriceVnd: 55_000,
        productVoucherId: "product-1", productVoucherType: "PRODUCT_DISCOUNT",
        addonVouchers: [{ voucherId: "addon-v", addonOptionId: "addon-1", discountVnd: 5_000 }],
        sourceCartId: "old", sourceUnitIndex: 0, bundleRewardVoucherToken: "bundle-1",
      }],
      selectedVoucherIds: ["discount-1", "discount-1"],
      bundleApplications: [{
        voucher_qr_token: "bundle-1", owner_key: "+8490",
        qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
        reward_allocations: [], created_reward_effects: [], status: "READY", message: "legacy",
      }],
      voucherOwnerKey: "+8490",
      isCartOpen: true,
    }, 9);

    expect(migrated).toEqual({
      items: [{
        cartId: "line-1", menuItemId: "drink-1", quantity: 1,
        configuration: {
          size: "MEDIUM", sweetness: "HALF", iceOption: "LESS_ICE", coldwhisk: true,
          note: "x", baseLiquidId: "milk-1", addonOptionIds: ["addon-1"],
        },
        lineVoucher: { token: "product-1", kind: "PRODUCT_DISCOUNT" },
        addonVouchers: [{ token: "addon-v", addonOptionId: "addon-1" }],
      }],
      selectedOrderVoucherTokens: ["discount-1"],
      voucherOwnerKey: "+8490",
      bundleApplications: [{
        voucher_qr_token: "bundle-1", owner_key: "+8490",
        qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
        reward_allocations: [], created_reward_effects: [],
      }],
    });
  });

  it("migrate staff chỉ giữ QR token, không giữ profile/points", () => {
    const migrated = migrateStaffCartState({
      items: [], selectedDiscountIds: ["discount-1"],
      customerInfo: { type: "existing", data: { qr_token: "customer-qr", points_balance: 99, name: "A" } },
      bundleApplications: [],
    }, 5);
    expect(migrated).toEqual({
      items: [], selectedOrderVoucherTokens: ["discount-1"], customerQrToken: "customer-qr", bundleApplications: [],
    });
  });

  it("migration keeps only the last attachment when one token appears in two roles", () => {
    const migrated = migrateCustomerCartState({
      items: [{
        cartId: "line",
        menuItemId: "drink",
        quantity: 1,
        size: "MEDIUM",
        sweetness: "FULL",
        iceOption: "NORMAL",
        selectedOptionIds: ["addon-1"],
        productVoucherId: "shared-token",
        addonVouchers: [{ voucherId: "shared-token", addonOptionId: "addon-1" }],
      }],
    }, 9);

    expect(migrated.items[0]?.lineVoucher).toBeUndefined();
    expect(migrated.items[0]?.addonVouchers).toEqual([
      { token: "shared-token", addonOptionId: "addon-1" },
    ]);
  });

  it("normalizes the persisted customer owner without retaining the bundle namespace", () => {
    const migrated = migrateCustomerCartState({
      items: [],
      voucherOwnerKey: "customer:090 123-4567",
      bundleApplications: [],
    }, 9);

    expect(migrated.voucherOwnerKey).toBe("+84901234567");
  });

  it("malformed persisted shape trả cart rỗng an toàn", () => {
    expect(migrateCustomerCartState("{bad", 9)).toEqual({
      items: [], selectedOrderVoucherTokens: [], voucherOwnerKey: null, bundleApplications: [],
    });
  });

  it("merges every legacy order-voucher source and splits a personal-voucher unit", () => {
    const migrated = migrateStaffCartState({
      items: [{
        cartId: "line", menuItemId: "drink", quantity: 3, size: "MEDIUM",
        sweetness: "FULL", iceOption: "NORMAL", selectedOptionIds: [], productVoucherId: "product",
      }],
      selectedOrderVoucherTokens: ["discount-a"],
      selectedDiscountIds: ["discount-b", "discount-a"],
      selectedVoucherIds: ["freeship"],
      discountVoucher: { qr_token: "scanned" },
    }, 5);
    expect(migrated.selectedOrderVoucherTokens).toEqual(["discount-a", "discount-b", "freeship", "scanned"]);
    expect(migrated.items).toEqual([
      expect.objectContaining({ cartId: "line", quantity: 2, addonVouchers: [] }),
      expect.objectContaining({ cartId: "line:voucher", quantity: 1, lineVoucher: { token: "product", kind: "PRODUCT" } }),
    ]);
    expect(migrated.items[0]).not.toHaveProperty("lineVoucher");
  });

  it("swallows malformed reads and quota writes, then clears the warning after recovery", () => {
    let shouldFail = true;
    let stored = "{bad";
    const warnings: Array<string | null> = [];
    const local: Storage = {
      length: 1,
      clear: () => { stored = ""; },
      getItem: () => stored,
      key: () => "bcbm-cart",
      removeItem: () => { stored = ""; },
      setItem: (_key, value) => {
        if (shouldFail) throw new DOMException("quota", "QuotaExceededError");
        stored = value;
      },
    };
    vi.stubGlobal("localStorage", local);
    const safe = createSafeCartStorage((warning) => warnings.push(warning));
    expect(safe.getItem("bcbm-cart")).toBeNull();
    expect(() => safe.setItem("bcbm-cart", "{\"state\":{}}")) .not.toThrow();
    expect(warnings.at(-1)).toContain("chưa được lưu");
    shouldFail = false;
    safe.setItem("bcbm-cart", "{\"state\":{}}");
    expect(safe.getItem("bcbm-cart")).toBe("{\"state\":{}}");
    expect(warnings.at(-1)).toBeNull();
  });

  it("keeps a successful runtime mutation and returns a warning when persistence is full", () => {
    let shouldFail = false;
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      length: 0,
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: () => null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => {
        if (shouldFail) throw new DOMException("quota", "QuotaExceededError");
        values.set(key, value);
      },
    } satisfies Storage);
    useCartStore.setState({ items: [], persistenceWarning: null });
    shouldFail = true;
    const result = useCartStore.getState().addItem({
      menuItemId: "drink",
      quantity: 1,
      configuration: {
        size: "MEDIUM", sweetness: "FULL", iceOption: "NORMAL", coldwhisk: false, note: "", addonOptionIds: [],
      },
      addonVouchers: [],
    });
    expect(result).toMatchObject({ ok: true, warning: { code: "PERSISTENCE_WRITE_FAILED" } });
    expect(useCartStore.getState().items).toHaveLength(1);

    shouldFail = false;
    const recovered = useCartStore.getState().updateQuantity(result.ok ? result.value.cartId : "", 2);
    expect(recovered.ok && recovered.warning).toBeUndefined();
    expect(useCartStore.getState().persistenceWarning).toBeNull();
  });
});
