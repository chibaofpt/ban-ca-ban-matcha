"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import {
  BundleRewardSelector,
  type BundleRewardOption,
} from "@/src/components/shared/BundleRewardSelector";
import type { CartItem } from "@/src/lib/types/cart";
import type { CartBundleApplication, BundleCreatedRewardEffect } from "@/src/lib/types/cart";
import { summarizeBundleCart, type BundleSelectionAllocation, type BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { cn } from "@/src/utils/cn";

/** Convert the wallet DTO into the shared selector's minimal rule summary. */
export function getBundleVoucherSummary(voucher: MyVoucher): BundleVoucherSummary | null {
  const rule = voucher.package.bundleRule;
  if (!rule || !voucher.availability.can_apply) return null;
  return {
    qr_token: voucher.qr_token,
    buy_quantity: rule.buy_quantity,
    reward_quantity: rule.reward_quantity,
    reward_kind: rule.reward_kind,
    reward_mode: rule.reward_mode,
    benefit_scaling: rule.benefit_scaling,
    max_applications_per_order: rule.max_applications_per_order,
    max_reward_units_per_order: rule.max_reward_units_per_order,
    eligible_products: rule.qualifier_products.map((product) => ({
      menu_item_id: product.menu_item_id,
      allowed_sizes: product.allowed_sizes,
      baseline_prices_vnd: product.baseline_prices_vnd,
      baseline_price_vnd: product.baseline_price_vnd,
    })),
    reward_products: rule.reward_products.map((product) => ({
      menu_item_id: product.menu_item_id,
      allowed_sizes: product.allowed_sizes,
      baseline_prices_vnd: product.baseline_prices_vnd,
      baseline_price_vnd: product.baseline_price_vnd,
    })),
    min_order_vnd: voucher.min_order_vnd,
  };
}

function getOptions(
  voucher: MyVoucher,
  cart: CartItem[],
  addonLabels: ReadonlyMap<string, string>,
): BundleRewardOption[] {
  const summary = getBundleVoucherSummary(voucher);
  const rule = voucher.package.bundleRule;
  if (!summary || !rule) return [];
  const matchesScope = (item: CartItem, scopes: typeof summary.eligible_products) =>
    scopes.some((scope) => scope.menu_item_id === item.menuItemId && (item.size === null ? scope.allowed_sizes.length === 0 : scope.allowed_sizes.includes(item.size)));
  if (summary.reward_kind === "PRODUCT") {
    const rewardScopes = summary.reward_mode === "SAME_CONFIG"
      ? summary.eligible_products
      : summary.reward_products;
    return cart
      .filter((item) => matchesScope(item, rewardScopes) && item.quantity > (item.productVoucherId ? 1 : 0))
      .map((item) => ({
        client_line_id: item.cartId,
        quantity: item.quantity - (item.productVoucherId ? 1 : 0),
        label: `${item.name} · ${item.size}`,
      }));
  }
  const allowedAddonIds = new Set(rule.reward_addon_option_ids);
  return cart
    .filter((item) => matchesScope(item, summary.eligible_products))
    .flatMap((item) => {
      const quantities = new Map(item.selectedOptionIds.map((id) => [id, 1]));
      item.quantityAddonOptions.forEach((addon) => quantities.set(addon.option_id, addon.quantity));
      return [...quantities.entries()]
        .filter(([addonOptionId]) => allowedAddonIds.has(addonOptionId))
        .map(([addonOptionId, quantity]) => ({
          client_line_id: item.cartId,
          addon_option_id: addonOptionId,
          quantity: quantity - (item.addonVouchers?.filter(
            (voucherLink) => voucherLink.addonOptionId === addonOptionId,
          ).length ?? 0),
          label: `${item.name} · ${addonLabels.get(addonOptionId) ?? "Addon"}`,
        }))
        .filter((option) => option.quantity > 0);
    });
}

/** Customer cart panel for selecting multiple BUNDLE vouchers and explicit reward allocations. */
export function CartBundleVoucherPanel({
  vouchers,
  cart,
  addonLabels,
  bundleApplications,
  onBundleApplicationChange,
  onRequestRemoveBundle,
  onAddExtrasReward,
}: {
  vouchers: MyVoucher[];
  cart: CartItem[];
  addonLabels: ReadonlyMap<string, string>;
  bundleApplications: CartBundleApplication[];
  onBundleApplicationChange: (voucher: MyVoucher, allocations: BundleSelectionAllocation[], effect?: BundleCreatedRewardEffect) => void;
  onRequestRemoveBundle: (voucherToken: string) => void;
  onAddExtrasReward?: (menuItemId: string, voucherToken: string) => { clientLineId: string; effect: BundleCreatedRewardEffect } | string | null;
}) {
  const changeApplication = (voucher: MyVoucher, nextAllocations: BundleSelectionAllocation[], effect?: BundleCreatedRewardEffect) => {
    onBundleApplicationChange(voucher, nextAllocations, effect);
  };
  const removeApplication = (token: string) => {
    onRequestRemoveBundle(token);
  };
  const [activeVoucherToken, setActiveVoucherToken] = useState<string | null>(bundleApplications[0]?.voucher_qr_token ?? null);
  const usableVouchers = vouchers.filter((voucher) => voucher.availability.can_apply);
  if (usableVouchers.length === 0) return null;
  const selectedVoucher = vouchers.find((voucher) => voucher.qr_token === activeVoucherToken);
  const summary = selectedVoucher ? getBundleVoucherSummary(selectedVoucher) : null;
  const application = selectedVoucher ? bundleApplications.find((item) => item.voucher_qr_token === selectedVoucher.qr_token) : undefined;
  const allocations = application?.reward_allocations ?? [];
  const options = selectedVoucher ? getOptions(selectedVoucher, cart, addonLabels) : [];
  const cartSummary = summarizeBundleCart(cart);
  const extrasRewardScopes = [
    ...new Map(
      (selectedVoucher?.package.bundleRule?.reward_products ?? [])
        .filter((scope) => scope.menu_item.category === "extras" && scope.menu_item.is_available)
        .map((scope) => [scope.menu_item_id, scope]),
    ).values(),
  ];

  return (
    <section id="cart-bundle-voucher-panel" tabIndex={-1} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 focus-visible:ring-2 focus-visible:ring-amber-600">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <Gift className="size-4" aria-hidden="true" /> Ưu đãi mua X tặng Y
      </p>
      <div className="grid gap-2">
        {usableVouchers.map((voucher) => {
          const isSelected = bundleApplications.some((application) => application.voucher_qr_token === voucher.qr_token);
          return (
            <button
              key={voucher.qr_token}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setActiveVoucherToken(voucher.qr_token);
                if (isSelected) removeApplication(voucher.qr_token);
                else changeApplication(voucher, []);
              }}
              className={cn(
                "min-h-11 rounded-xl border bg-white px-3 py-2 text-left text-sm font-semibold",
                isSelected ? "border-amber-600 text-amber-900" : "border-amber-200",
              )}
            >
              {voucher.package.name}
            </button>
          );
        })}
      </div>
      {selectedVoucher && summary ? (
        <>
          {onAddExtrasReward && extrasRewardScopes.length > 0 ? (
            <div className="grid gap-2">
              {extrasRewardScopes.map((scope) => (
                <button
                  key={`add-${scope.menu_item_id}`}
                  type="button"
                  onClick={() => {
                    const created = onAddExtrasReward(scope.menu_item_id, selectedVoucher.qr_token);
                    if (created) {
                      const clientLineId = typeof created === "string" ? created : created.clientLineId;
                      changeApplication(selectedVoucher, [...allocations, { client_line_id: clientLineId, quantity: 1 }], typeof created === "string" ? undefined : created.effect);
                    }
                  }}
                  className="min-h-11 rounded-xl border border-dashed border-amber-500 bg-white px-3 text-left text-sm font-bold text-amber-900"
                >
                  + Thêm quà {scope.menu_item.name}
                </button>
              ))}
            </div>
          ) : null}
          <BundleRewardSelector
            voucher={summary}
            cart={cartSummary}
            options={options}
            selected={allocations}
            onChange={(next) => changeApplication(selectedVoucher, next)}
          />
        </>
      ) : null}
    </section>
  );
}
