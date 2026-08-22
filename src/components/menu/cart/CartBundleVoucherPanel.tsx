"use client";

import { Gift } from "lucide-react";
import {
  BundleRewardSelector,
  type BundleRewardOption,
} from "@/src/components/shared/BundleRewardSelector";
import type { CartItem } from "@/src/lib/types/cart";
import { summarizeBundleCart, type BundleSelectionAllocation, type BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { cn } from "@/src/utils/cn";

/** Convert the wallet DTO into the shared selector's minimal rule summary. */
export function getBundleVoucherSummary(voucher: MyVoucher): BundleVoucherSummary | null {
  const rule = voucher.package.bundleRule;
  if (!rule) return null;
  return {
    qr_token: voucher.qr_token,
    buy_quantity: rule.buy_quantity,
    reward_quantity: rule.reward_quantity,
    reward_kind: rule.reward_kind,
    reward_mode: rule.reward_mode,
    benefit_scaling: rule.benefit_scaling,
    max_applications_per_order: rule.max_applications_per_order,
    max_reward_units_per_order: rule.max_reward_units_per_order,
    eligible_menu_item_ids: rule.qualifier_products.map((product) => product.menu_item_id),
    reward_menu_item_ids: rule.reward_products.map((product) => product.menu_item_id),
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
  if (summary.reward_kind === "PRODUCT") {
    const rewardIds = summary.reward_mode === "SAME_CONFIG"
      ? summary.eligible_menu_item_ids
      : summary.reward_menu_item_ids;
    return cart
      .filter((item) => rewardIds.includes(item.menuItemId) && item.quantity > (item.productVoucherId ? 1 : 0))
      .map((item) => ({
        client_line_id: item.cartId,
        quantity: item.quantity - (item.productVoucherId ? 1 : 0),
        label: `${item.name} · ${item.size}`,
      }));
  }
  const allowedAddonIds = new Set(rule.reward_addon_option_ids);
  return cart
    .filter((item) => summary.eligible_menu_item_ids.includes(item.menuItemId))
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

/** Customer cart panel for selecting one BUNDLE voucher and its explicit rewards. */
export function CartBundleVoucherPanel({
  vouchers,
  cart,
  addonLabels,
  selectedVoucherToken,
  allocations,
  onVoucherChange,
  onAllocationsChange,
  onAddExtrasReward,
  onRemoveTransientRewards,
}: {
  vouchers: MyVoucher[];
  cart: CartItem[];
  addonLabels: ReadonlyMap<string, string>;
  selectedVoucherToken: string | null;
  allocations: BundleSelectionAllocation[];
  onVoucherChange: (token: string | null) => void;
  onAllocationsChange: (allocations: BundleSelectionAllocation[]) => void;
  onAddExtrasReward?: (menuItemId: string, voucherToken: string) => string | null;
  onRemoveTransientRewards?: (voucherToken: string) => void;
}) {
  if (vouchers.length === 0) return null;
  const selectedVoucher = vouchers.find((voucher) => voucher.qr_token === selectedVoucherToken);
  const summary = selectedVoucher ? getBundleVoucherSummary(selectedVoucher) : null;
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
        {vouchers.map((voucher) => {
          const isSelected = voucher.qr_token === selectedVoucherToken;
          return (
            <button
              key={voucher.qr_token}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                if (selectedVoucherToken) onRemoveTransientRewards?.(selectedVoucherToken);
                onVoucherChange(isSelected ? null : voucher.qr_token);
                onAllocationsChange([]);
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
                    const clientLineId = onAddExtrasReward(scope.menu_item_id, selectedVoucher.qr_token);
                    if (clientLineId) {
                      onAllocationsChange([...allocations, { client_line_id: clientLineId, quantity: 1 }]);
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
            onChange={onAllocationsChange}
          />
        </>
      ) : null}
    </section>
  );
}
