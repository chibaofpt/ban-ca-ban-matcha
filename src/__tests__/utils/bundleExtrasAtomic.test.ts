import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { BundleCartDraftCommit } from "@/src/lib/types/cart";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import { buildBundleCartDraft, validateBundleCartDraft, type BundleDraftSlot } from "@/src/lib/utils/bundleCartDraft";
import type { BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";

const baseItem = (cartId: string, menuItemId = "drink-1") => projectedCartLine({
  cartId,
  menuItemId,
  name: menuItemId === "drink-1" ? "Matcha" : "Quà",
  category: menuItemId === "drink-1" ? "latte" : "extras",
  imageUrl: null,
  size: menuItemId === "drink-1" ? "MEDIUM" : null,
  unitPrice: menuItemId === "drink-1" ? 45_000 : 12_000,
  quantity: 1,
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "",
  selectedOptionIds: [],
  addonsPrice: 0,
  addonPrices: {},
  clientPriceVnd: menuItemId === "drink-1" ? 45_000 : 12_000,
  originalClientPriceVnd: menuItemId === "drink-1" ? 45_000 : 12_000,
});

const qualifierSlot = (sourceCartId: string): BundleDraftSlot => ({
  role: "qualifier",
  sourceCartId,
  sourceUnitIndex: 0,
  config: {
    menuItemId: "drink-1",
    name: "Matcha",
    category: "latte",
    imageUrl: null,
    size: "MEDIUM",
    powderId: null,
    milkTypeId: null,
    baseLiquidId: null,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    selectedOptionIds: [],
    unitPriceVnd: 45_000,
    addonsCost: 0,
    addonPrices: {},
  },
});

const rewardSlot = (menuItemId = "extra-1"): BundleDraftSlot => ({
  role: "reward",
  config: {
    menuItemId,
    name: "Quà",
    category: "extras",
    imageUrl: null,
    size: null,
    powderId: null,
    milkTypeId: null,
    baseLiquidId: null,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    selectedOptionIds: [],
    unitPriceVnd: 12_000,
    addonsCost: 0,
    addonPrices: {},
  },
});

const summary: BundleVoucherSummary = {
  qr_token: "bundle-extras",
  buy_quantity: 1,
  reward_quantity: 1,
  reward_kind: "PRODUCT",
  reward_mode: "ALLOWED_SCOPE",
  benefit_scaling: "PER_BUNDLE",
  max_applications_per_order: 1,
  max_reward_units_per_order: null,
  reward_addon_option_ids: [],
  eligible_products: [{ menu_item_id: "drink-1", allowed_sizes: ["MEDIUM"], baseline_prices_vnd: { MEDIUM: 45_000 } }],
  reward_products: [{ menu_item_id: "extra-1", allowed_sizes: [], baseline_price_vnd: 12_000 }],
  min_order_vnd: null,
};

function buildCandidate(rewardMenuItemId = "extra-1") {
  const candidate = buildBundleCartDraft({
    items: [baseItem("drink-line")],
    voucher_qr_token: summary.qr_token,
    qualifierSlots: [qualifierSlot("drink-line")],
    rewardSlots: [rewardSlot(rewardMenuItemId)],
    rewardKind: "PRODUCT",
    rewardQuantity: 1,
    createCartId: () => "reward-line",
  });
  return {
    ...candidate,
    projectedItems: candidate.items.map((line) => projectedCartLine({
      ...line,
      name: line.menuItemId === "drink-1" ? "Matcha" : "Quà",
      category: line.configuration.size === null ? "extras" : "latte",
      size: line.configuration.size,
      unitPrice: line.configuration.size === null ? 12_000 : 45_000,
      originalClientPriceVnd: line.configuration.size === null ? 12_000 : 45_000,
      clientPriceVnd: line.configuration.size === null ? 12_000 : 45_000,
    })),
  };
}

describe("BUNDLE extras setup atomic seam", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], bundleApplications: [] });
    useStaffCartStore.setState({ items: [], bundleApplications: [] });
  });

  it("keeps customer and staff state byte-equivalent when validation rejects extras", () => {
    const candidate = buildCandidate("outside-extra");
    const beforeCustomer = { items: useCartStore.getState().items, applications: useCartStore.getState().bundleApplications };
    const beforeStaff = { items: useStaffCartStore.getState().items, applications: useStaffCartStore.getState().bundleApplications };
    const customerValidation = validateBundleCartDraft({ voucher: summary, candidate, ownerKey: "customer:qr-1" });
    const staffValidation = validateBundleCartDraft({ voucher: summary, candidate, ownerKey: "staff:qr-1" });
    if (customerValidation.ok) useCartStore.getState().commitBundleCartDraft(customerValidation.draft);
    if (staffValidation.ok) useStaffCartStore.getState().commitBundleCartDraft(staffValidation.draft);
    expect(customerValidation.ok).toBe(false);
    expect(staffValidation.ok).toBe(false);
    expect({ items: useCartStore.getState().items, applications: useCartStore.getState().bundleApplications }).toEqual(beforeCustomer);
    expect({ items: useStaffCartStore.getState().items, applications: useStaffCartStore.getState().bundleApplications }).toEqual(beforeStaff);
  });

  it("commits a valid extras reward and READY application once in each cart store", () => {
    const candidate = buildCandidate();
    const customerValidation = validateBundleCartDraft({ voucher: summary, candidate, ownerKey: "customer:qr-1" });
    const staffValidation = validateBundleCartDraft({ voucher: summary, candidate, ownerKey: "staff:qr-1" });
    expect(customerValidation.ok).toBe(true);
    expect(staffValidation.ok).toBe(true);
    if (!customerValidation.ok || !staffValidation.ok) return;
    const customerCommit: BundleCartDraftCommit = customerValidation.draft;
    const staffCommit: BundleCartDraftCommit = staffValidation.draft;
    useCartStore.getState().commitBundleCartDraft(customerCommit);
    useStaffCartStore.getState().commitBundleCartDraft(staffCommit);
    expect(useCartStore.getState().bundleApplications).toHaveLength(1);
    expect(useStaffCartStore.getState().bundleApplications).toHaveLength(1);
    expect(useCartStore.getState().bundleRuntime[summary.qr_token]?.status).toBe("READY");
    expect(useStaffCartStore.getState().bundleRuntime[summary.qr_token]?.status).toBe("READY");
    expect(useCartStore.getState().items.find((item) => item.cartId === "reward-line")?.menuItemId).toBe("extra-1");
    expect(useStaffCartStore.getState().items.find((item) => item.cartId === "reward-line")?.menuItemId).toBe("extra-1");
    expect(useCartStore.getState().items.find((item) => item.cartId === "reward-line")).not.toHaveProperty("bundleRewardVoucherToken");
  });

  it("keeps extras quick-add on the shared setup route", () => {
    const panel = readFileSync(new URL("../../components/menu/cart/CartBundleVoucherPanel.tsx", import.meta.url), "utf8");
    const customer = readFileSync(new URL("../../components/menu/CartDrawer.tsx", import.meta.url), "utf8");
    const picker = readFileSync(new URL("../../components/menu/cart/CartDiscountPicker.tsx", import.meta.url), "utf8");
    const staff = readFileSync(new URL("../../components/staff/StaffCartDrawer.tsx", import.meta.url), "utf8");
    const staffPage = readFileSync(new URL("../../views/staff/StaffOrdersPage.tsx", import.meta.url), "utf8");
    expect(panel).not.toContain("onAddExtrasReward");
    expect(customer).not.toContain("onAddExtrasReward");
    expect(picker).not.toContain("onAddExtrasReward");
    expect(staff).not.toContain("onAddExtrasReward");
    expect(staffPage).not.toContain("onAddExtrasReward");
    expect(panel).toContain("onOpenBundleSetup");
    expect(picker).toContain("initialApplication={bundleApplications.find");
    const modal = readFileSync(new URL("../../components/shared/VoucherModal.tsx", import.meta.url), "utf8");
    expect(modal).toContain("initialApplication={bundleApplications.find");
  });
});
