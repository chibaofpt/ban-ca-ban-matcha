"use client";

import React from "react";
import { X, Gift } from "lucide-react";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import type { BundleVoucherRule, BundleVoucherProduct } from "@/src/services/customerVoucherService";
import type { MenuData, MilkTypeOption, Size } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { getBundleCartDisplayTotals } from "@/src/lib/utils/bundleCartSummary";
import { CartMoney } from "@/src/components/shared/CartMoney";

export interface BundleAllocationBadge {
  token: string;
  label: string;
  quantity: number;
}

interface CartBundleSectionProps {
  qualifierItems: ProjectedCartLine[];
  rewardItems: ProjectedCartLine[];
  bundleRule?: BundleVoucherRule;
  bundleName: string;
  bundleDiscountVnd: number;
  qualifierAllocations: BundleSelectionAllocation[];
  rewardAllocations: BundleSelectionAllocation[];
  errorMessage?: string | null;
  menuData: MenuData;
  powders: Powder[];
  milkTypes: MilkTypeOption[];
  /** Called when user taps item to edit config — parent opens ProductModal. */
  onEditItem: (item: ProjectedCartLine, allowedSizes: Size[]) => void;
  /** Called when user removes the entire bundle section. */
  onRemoveBundle: () => void;
  renderItem: (item: ProjectedCartLine, allowedSizes: Size[], editDisabled: boolean) => React.ReactNode;
  onRepairBundle?: () => void;
  /** Cross-voucher size intersection and allocation quantities for one rendered line. */
  allowedSizesByCartId?: ReadonlyMap<string, Size[]>;
  nonEditableCartIds?: ReadonlySet<string>;
  allocationBadgesByCartId?: ReadonlyMap<string, BundleAllocationBadge[]>;
  isVerifying?: boolean;
}

/** In-cart grouped display for a BUNDLE voucher — qualifier on top, divider, reward below. */
export function CartBundleSection({
  qualifierItems,
  rewardItems,
  bundleRule,
  bundleName,
  bundleDiscountVnd,
  qualifierAllocations,
  rewardAllocations,
  errorMessage,
  menuData,
  onRemoveBundle,
  renderItem,
  onRepairBundle,
  allowedSizesByCartId,
  nonEditableCartIds,
  allocationBadgesByCartId,
  isVerifying = false,
}: CartBundleSectionProps) {
  const bundleItems = [...qualifierItems, ...rewardItems];
  const bundleTotals = getBundleCartDisplayTotals(
    bundleItems,
    [...qualifierAllocations, ...rewardAllocations],
    bundleDiscountVnd,
  );
  const selectedAddonOptionId = rewardAllocations.find((allocation) => allocation.addon_option_id)?.addon_option_id;
  const effectiveRewardKind = bundleRule?.reward_kind
    ?? (selectedAddonOptionId ? "ADDON" : "PRODUCT");
  const selectedAddonLabel = selectedAddonOptionId
    ? menuData.addon_groups.flatMap((group) => group.options).find((option) => option.id === selectedAddonOptionId)?.label
    : undefined;

  const getScopes = (role: "QUALIFIER" | "REWARD"): BundleVoucherProduct[] => {
    if (!bundleRule) return [];
    if (role === "QUALIFIER") return bundleRule.qualifier_products.filter((p) => p.menu_item.is_available);
    if (bundleRule.reward_mode === "SAME_CONFIG") return bundleRule.qualifier_products.filter((p) => p.menu_item.is_available);
    return bundleRule.reward_products.filter((p) => p.menu_item.is_available);
  };
  const allowedSizesForItem = (item: ProjectedCartLine, role: "QUALIFIER" | "REWARD"): Size[] =>
    allowedSizesByCartId?.get(item.cartId) ?? getScopes(role).find((scope) => scope.menu_item_id === item.menuItemId)?.allowed_sizes ?? [];

  const renderItemGroup = (items: ProjectedCartLine[], role: "QUALIFIER" | "REWARD") => {
    const allocatedQuantity = (role === "QUALIFIER" ? qualifierAllocations : rewardAllocations)
      .reduce((sum, allocation) => sum + allocation.quantity, 0);
    const label = role === "QUALIFIER"
      ? `Món mua (${bundleRule?.buy_quantity ?? allocatedQuantity})`
      : effectiveRewardKind === "ADDON"
        ? `Ly nhận topping (${allocatedQuantity})`
        : `Món tặng (${bundleRule?.reward_quantity ?? allocatedQuantity})`;
    const scopes = getScopes(role);
    const canSwap = scopes.length > 1 && !items.some((item) => (allocationBadgesByCartId?.get(item.cartId)?.length ?? 0) > 1);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase text-amber-800/80">{label}</h4>
          {canSwap && items[0] && onRepairBundle && (
            <button
              onClick={onRepairBundle}
              className="min-h-11 px-3 text-xs font-bold text-amber-700 rounded-full bg-amber-100/60 active:bg-amber-200"
            >
              Chọn lại món
            </button>
          )}
        </div>
        {items.map((item) => (
          <React.Fragment key={item.cartId}>
            {renderItem(item, allowedSizesForItem(item, role), isVerifying || Boolean(nonEditableCartIds?.has(item.cartId)))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 space-y-3 mx-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Gift className="mt-0.5 w-4 h-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-amber-800">{bundleName}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-amber-700/80">
                {bundleRule ? `Mua ${bundleRule.buy_quantity} · Tặng ${bundleRule.reward_quantity}` : "Đang tải thông tin quyền lợi…"}
              </p>
            </div>
          </div>
          <button
            onClick={onRemoveBundle}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-amber-600 active:bg-amber-100"
            aria-label="Xoá ưu đãi bundle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-amber-100 bg-white/70 px-3 py-2 text-[11px]">
          <div><p className="text-amber-700/70">Tạm tính</p><p className="font-bold text-amber-900"><CartMoney amountVnd={bundleTotals.grossVnd} /></p></div>
          <div><p className="text-amber-700/70">Giảm</p><p className="font-bold text-red-700"><CartMoney amountVnd={bundleTotals.discountVnd} discount /></p></div>
          <div><p className="text-amber-700/70">Còn lại</p><p className="font-bold text-amber-900"><CartMoney amountVnd={bundleTotals.netVnd} /></p></div>
        </div>
        {bundleTotals.paidToppingsVnd > 0 ? (
          <p className="text-[11px] font-semibold text-amber-800/80">Topping trả thêm: <CartMoney amountVnd={bundleTotals.paidToppingsVnd} /></p>
        ) : null}
        {errorMessage ? (
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isVerifying ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
            <p className={`flex-1 text-xs font-semibold ${isVerifying ? "text-amber-800" : "text-red-800"}`}>{errorMessage}</p>
            {!isVerifying && onRepairBundle ? (
              <button type="button" onClick={onRepairBundle} className="min-h-11 shrink-0 rounded-lg border border-red-300 bg-white px-3 text-xs font-bold text-red-800">Sửa</button>
            ) : null}
          </div>
        ) : null}

        {/* Qualifier */}
        {renderItemGroup(qualifierItems, "QUALIFIER")}

        {/* Divider */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-amber-200" />
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 border border-amber-200">
            <Gift className="w-3 h-3 text-amber-600" />
            <span className="text-xs font-bold text-amber-700">Tặng</span>
          </div>
          <div className="flex-1 h-px bg-amber-200" />
        </div>

        {/* Reward */}
        {rewardItems.length > 0
          ? renderItemGroup(rewardItems, "REWARD")
          : effectiveRewardKind === "ADDON" && (
            <div className="p-3 rounded-xl bg-white/80 border border-amber-100 text-center">
              <span className="text-xs font-bold text-amber-700">
                Topping {selectedAddonLabel ?? "chưa chọn"}
              </span>
            </div>
          )}
      </div>
  );
}
