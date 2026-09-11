import { describe, expect, it } from "vitest";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import type { CartBundleApplication, ProjectedCartLine } from "@/src/lib/types/cart";
import type { AddonGroup } from "@/src/lib/types/menu";
import {
  resolveBundleAutofill,
  resolveBundleUnitCandidates,
  type BundleCandidateRequirement,
} from "@/src/lib/utils/bundleCandidateResolver";
import type { BundleProductScope } from "@/src/lib/utils/voucherUseNowHelpers";

const scope = (menuItemId = "drink"): BundleProductScope => ({
  menu_item_id: menuItemId,
  default_powder_id: null,
  default_base_liquid_id: null,
  allowed_sizes: ["MEDIUM"],
  menu_item: { name: menuItemId, category: "latte", is_available: true },
});

const line = (cartId: string, quantity = 1, menuItemId = "drink"): ProjectedCartLine => projectedCartLine({
  cartId,
  menuItemId,
  name: menuItemId,
  category: "latte",
  imageUrl: null,
  size: "MEDIUM",
  unitPrice: 45_000,
  quantity,
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "",
  selectedOptionIds: [],
  addonsPrice: 0,
  addonPrices: {},
  clientPriceVnd: 45_000,
  originalClientPriceVnd: 45_000,
});

const requirement = (
  role: BundleCandidateRequirement["role"],
  count: number,
  scopes: BundleProductScope[] = [scope()],
): BundleCandidateRequirement => ({ role, count, scopes });

const application = (token: string, cartId: string, quantity = 1): CartBundleApplication => ({
  voucher_qr_token: token,
  owner_key: "owner",
  qualifier_allocations: [{ client_line_id: cartId, quantity }],
  reward_allocations: [],
  created_reward_effects: [],
});

describe("BUNDLE unit candidate resolver", () => {
  it("distinguishes no plan, one complete plan, and multiple complete plans", () => {
    const none = resolveBundleAutofill({
      items: [line("wrong", 1, "other")], requirements: [requirement("QUALIFIER", 1)], applications: [], currentVoucherToken: "current",
    });
    const unique = resolveBundleAutofill({
      items: [line("one")], requirements: [requirement("QUALIFIER", 1)], applications: [], currentVoucherToken: "current",
    });
    const ambiguous = resolveBundleAutofill({
      items: [line("one"), line("two")], requirements: [requirement("QUALIFIER", 1)], applications: [], currentVoucherToken: "current",
    });
    expect(none.status).toBe("NONE");
    expect(unique).toMatchObject({ status: "UNIQUE", selections: { QUALIFIER: [{ cartId: "one", unitIndex: 0 }] } });
    expect(ambiguous).toEqual({ status: "AMBIGUOUS", selections: {} });
  });

  it("keeps available units after partial sibling allocation and reports its conflict", () => {
    const candidates = resolveBundleUnitCandidates({
      items: [line("many", 3)],
      requirement: requirement("QUALIFIER", 1),
      applications: [application("sibling", "many", 2)],
      currentVoucherToken: "current",
    });
    expect(candidates.map((candidate) => candidate.conflicts)).toEqual([
      ["SIBLING_BUNDLE"], ["SIBLING_BUNDLE"], [],
    ]);
  });

  it("excludes a personal-voucher unit and prevents a reward unit from also qualifying", () => {
    const personal = { ...line("personal"), lineVoucher: { token: "item", kind: "ITEM" as const } };
    expect(resolveBundleUnitCandidates({
      items: [personal], requirement: requirement("QUALIFIER", 1), applications: [], currentVoucherToken: "current",
    })[0]?.conflicts).toContain("PERSONAL_VOUCHER");
    const result = resolveBundleAutofill({
      items: [line("shared")],
      requirements: [requirement("QUALIFIER", 1), requirement("PRODUCT_REWARD", 1)],
      applications: [],
      currentVoucherToken: "current",
    });
    expect(result.status).toBe("NONE");
  });

  it("reopens the exact persisted qualifier and product reward allocations", () => {
    const persisted: CartBundleApplication = {
      ...application("current", "buy"),
      reward_allocations: [{ client_line_id: "gift", quantity: 1 }],
    };
    const result = resolveBundleAutofill({
      items: [line("buy"), line("gift")],
      requirements: [requirement("QUALIFIER", 1), requirement("PRODUCT_REWARD", 1)],
      applications: [persisted],
      currentVoucherToken: "current",
      initialApplication: persisted,
    });
    expect(result).toMatchObject({
      status: "PERSISTED",
      selections: { QUALIFIER: [{ cartId: "buy" }], PRODUCT_REWARD: [{ cartId: "gift" }] },
    });
  });

  it("restores qualifier and product reward as different units of one aggregated line", () => {
    const persisted: CartBundleApplication = {
      ...application("current", "shared"),
      reward_allocations: [{ client_line_id: "shared", quantity: 1 }],
    };
    const result = resolveBundleAutofill({
      items: [line("shared", 2)],
      requirements: [requirement("QUALIFIER", 1), requirement("PRODUCT_REWARD", 1)],
      applications: [persisted], currentVoucherToken: "current", initialApplication: persisted,
    });
    expect(result).toMatchObject({
      status: "PERSISTED",
      selections: { QUALIFIER: [{ unitIndex: 0 }], PRODUCT_REWARD: [{ unitIndex: 1 }] },
    });
  });

  it("does not autofill a SAME_CONFIG plan across different products", () => {
    const result = resolveBundleAutofill({
      items: [line("buy", 1, "drink-a"), line("gift", 1, "drink-b")],
      requirements: [
        requirement("QUALIFIER", 1, [scope("drink-a"), scope("drink-b")]),
        requirement("PRODUCT_REWARD", 1, [scope("drink-a"), scope("drink-b")]),
      ],
      applications: [], currentVoucherToken: "current",
      sameProductRatio: { buyQuantity: 1, rewardQuantity: 1 },
    });
    expect(result.status).toBe("NONE");
  });

  it("checks addon capacity and Extra Matcha, and leaves multiple addon recipients explicit", () => {
    const normalGroup: AddonGroup = {
      id: "toppings", name: "Toppings", image_url: null, sort_order: 1, max_select: 1, is_dynamic_gram: false,
      options: [{ id: "pearls", label: "Pearls", image_url: null, price_vnd: 10_000, gram_value: null, sort_order: 1 }],
    };
    const baseFull = line("full");
    const full: ProjectedCartLine = {
      ...baseFull,
      configuration: baseFull.configuration.size === null ? baseFull.configuration : {
        ...baseFull.configuration,
        addonOptionIds: ["existing"],
      },
      resolvedAddons: [{
        id: "existing", label: "Existing", priceVnd: 5_000, groupId: "toppings",
        groupName: "Toppings", maxSelect: 1, isExtraMatcha: false,
      }],
    };
    const addonRequirement: BundleCandidateRequirement = {
      ...requirement("ADDON_RECIPIENT", 1), addon: { group: normalGroup, optionId: "pearls" },
    };
    expect(resolveBundleUnitCandidates({
      items: [full], requirement: addonRequirement, applications: [], currentVoucherToken: "current",
    })[0]?.conflicts).toContain("ADDON_GROUP_FULL");

    const extraGroup: AddonGroup = {
      ...normalGroup, is_dynamic_gram: true,
      options: [{ ...normalGroup.options[0], id: "extra-matcha", gram_value: 1 }],
    };
    expect(resolveBundleUnitCandidates({
      items: [line("cup")],
      requirement: { ...addonRequirement, addon: { group: extraGroup, optionId: "extra-matcha" } },
      applications: [], currentVoucherToken: "current",
    })[0]?.conflicts).toContain("EXTRA_MATCHA");

    expect(resolveBundleAutofill({
      items: [line("one"), line("two")], requirements: [addonRequirement], applications: [], currentVoucherToken: "current",
    }).status).toBe("AMBIGUOUS");
  });
});
