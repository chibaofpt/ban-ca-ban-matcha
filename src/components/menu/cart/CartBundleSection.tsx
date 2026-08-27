"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Gift } from "lucide-react";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { buildBundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import { computeVoucherItemPrice } from "@/src/hooks/useAddVoucherToCart";
import type { CartItem } from "@/src/lib/types/cart";
import type { BundleVoucherRule, BundleVoucherProduct } from "@/src/services/customerVoucherService";
import type { MenuData, MilkTypeOption, Size } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";

export interface BundleAllocationBadge {
  token: string;
  label: string;
  quantity: number;
}

interface CartBundleSectionProps {
  qualifierItems: CartItem[];
  rewardItems: CartItem[];
  bundleRule: BundleVoucherRule;
  menuData: MenuData;
  powders: Powder[];
  milkTypes: MilkTypeOption[];
  defaultPowderGram: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }>;
  /** Called when user taps item to edit config — parent opens ProductModal. */
  onEditItem: (item: CartItem, allowedSizes: Size[]) => void;
  /** Called when user swaps an item — parent calls updateItem(oldCartId, newData). */
  onSwapItem: (oldCartId: string, newData: Partial<CartItem>) => void;
  /** Called when user removes the entire bundle section. */
  onRemoveBundle: () => void;
  /** Cross-voucher size intersection and allocation quantities for one rendered line. */
  allowedSizesByCartId?: ReadonlyMap<string, Size[]>;
  nonEditableCartIds?: ReadonlySet<string>;
  allocationBadgesByCartId?: ReadonlyMap<string, BundleAllocationBadge[]>;
}

/** Formats a CartItem configuration as a compact display string. */
function formatItemConfig(item: CartItem): string {
  const parts: string[] = [];
  if (item.size) parts.push(`Size ${item.size === "SMALL" ? "S" : item.size === "MEDIUM" ? "M" : "L"}`);
  const sweetnessLabel: Record<string, string> = {
    NONE: "Không đường", QUARTER: "Ít đường", HALF: "Nửa đường",
    THREE_QUARTER: "Vừa đường", FULL: "Nguyên đường", EXTRA: "Thêm đường",
  };
  if (item.sweetness) parts.push(sweetnessLabel[item.sweetness] ?? item.sweetness);
  const iceLabel: Record<string, string> = {
    NORMAL: "Đá bình thường", LESS_ICE: "Ít đá", NO_ICE: "Không đá", SEPARATE_ICE: "Đá riêng",
  };
  if (item.iceOption) parts.push(iceLabel[item.iceOption] ?? item.iceOption);
  return parts.join(" · ");
}

/** In-cart grouped display for a BUNDLE voucher — qualifier on top, divider, reward below. */
export function CartBundleSection({
  qualifierItems,
  rewardItems,
  bundleRule,
  menuData,
  powders,
  milkTypes,
  defaultPowderGram,
  onEditItem,
  onSwapItem,
  onRemoveBundle,
  allowedSizesByCartId,
  nonEditableCartIds,
  allocationBadgesByCartId,
}: CartBundleSectionProps) {
  const [swapRole, setSwapRole] = useState<"QUALIFIER" | "REWARD" | null>(null);
  const [swapTargetCartId, setSwapTargetCartId] = useState<string | null>(null);

  const allMenuItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];

  const getScopes = (role: "QUALIFIER" | "REWARD"): BundleVoucherProduct[] => {
    if (role === "QUALIFIER") return bundleRule.qualifier_products.filter((p) => p.menu_item.is_available);
    if (bundleRule.reward_mode === "SAME_CONFIG") return bundleRule.qualifier_products.filter((p) => p.menu_item.is_available);
    return bundleRule.reward_products.filter((p) => p.menu_item.is_available);
  };
  const allowedSizesForItem = (item: CartItem, role: "QUALIFIER" | "REWARD"): Size[] =>
    allowedSizesByCartId?.get(item.cartId) ?? getScopes(role).find((scope) => scope.menu_item_id === item.menuItemId)?.allowed_sizes ?? [];

  const handleSwapSelect = (scope: BundleVoucherProduct) => {
    if (!swapTargetCartId) return;
    const fullItem = allMenuItems.find((i) => i.id === scope.menu_item_id);
    if (!fullItem) return;
    const initial = buildBundleItemConfig(scope, fullItem, milkTypes);
    const unitPriceVnd = fullItem.category === "extras"
      ? fullItem.unit_price_vnd ?? 0
      : initial.size
        ? computeVoucherItemPrice(
            fullItem, initial.size, initial.powderId, initial.baseLiquidId ?? null,
            [], powders, defaultPowderGram, menuData.latte, milkTypes, menuData.addon_groups,
          ).drinkPrice
        : 0;
    onSwapItem(swapTargetCartId, {
      menuItemId: fullItem.id,
      name: fullItem.name,
      category: fullItem.category,
      imageUrl: fullItem.image_url,
      size: initial.size,
      unitPrice: unitPriceVnd,
      clientPriceVnd: unitPriceVnd,
      originalClientPriceVnd: unitPriceVnd,
      sweetness: initial.sweetness,
      iceOption: initial.iceOption,
      coldwhisk: initial.coldwhisk,
      selectedOptionIds: initial.selectedOptionIds,
      quantityMap: initial.quantityMap,
      addonsPrice: initial.addonsCost,
      addonPrices: initial.addonPrices,
      quantityAddonOptions: initial.quantityAddonOptions,
      selectedPowderId: fullItem.category === "fusion" ? initial.powderId ?? undefined : undefined,
      selectedBaseLiquidId: fullItem.category === "latte" ? initial.baseLiquidId ?? undefined : undefined,
      selectedMilkTypeId: fullItem.category === "latte" ? initial.milkTypeId ?? undefined : undefined,
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      itemVoucherId: undefined,
      addonVouchers: [],
      note: "",
    });
    setSwapRole(null);
    setSwapTargetCartId(null);
  };

  const renderItemGroup = (items: CartItem[], role: "QUALIFIER" | "REWARD") => {
    const label = role === "QUALIFIER"
      ? `Món mua (${bundleRule.buy_quantity})`
      : `Món tặng (${bundleRule.reward_quantity})`;
    const scopes = getScopes(role);
    const canSwap = scopes.length > 1 && !items.some((item) => (allocationBadgesByCartId?.get(item.cartId)?.length ?? 0) > 1);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase text-amber-800/80">{label}</h4>
          {canSwap && items[0] && (
            <button
              onClick={() => { setSwapRole(role); setSwapTargetCartId(items[0]!.cartId); }}
              className="min-h-11 px-3 text-xs font-bold text-amber-700 rounded-full bg-amber-100/60 active:bg-amber-200"
            >
              Đổi món
            </button>
          )}
        </div>
        {items.map((item) => (
          <button
            key={item.cartId}
            onClick={() => onEditItem(item, allowedSizesForItem(item, role))}
            disabled={nonEditableCartIds?.has(item.cartId)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-amber-100 text-left disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="w-12 h-12 bg-amber-50 rounded-lg relative overflow-hidden shrink-0">
              {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-primary truncate">{item.name}</p>
              <p className="text-xs text-primary/50 truncate">{formatItemConfig(item)}</p>
              <p className="text-xs font-bold text-amber-700 mt-0.5">
                {role === "REWARD" ? "Ưu đãi áp dụng khi chốt đơn" : `${(item.clientPriceVnd / 1000).toLocaleString("vi-VN")}K`}
              </p>
              {(allocationBadgesByCartId?.get(item.cartId) ?? []).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1" aria-label="Phân bổ ưu đãi BUNDLE">
                  {allocationBadgesByCartId?.get(item.cartId)?.map((badge) => (
                    <span key={badge.token} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                      {badge.label}: {badge.quantity} phần
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 space-y-3 mx-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">Ưu đãi Bundle</span>
          </div>
          <button
            onClick={onRemoveBundle}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-amber-600 active:bg-amber-100"
            aria-label="Xoá ưu đãi bundle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
          : bundleRule.reward_kind === "ADDON" && (
            <div className="p-3 rounded-xl bg-white/80 border border-amber-100 text-center">
              <span className="text-xs font-bold text-amber-700">
                Topping {menuData.addon_groups.flatMap((g) => g.options).find((o) => o.id === bundleRule.reward_addon_option_ids[0])?.label ?? "miễn phí"}
              </span>
            </div>
          )}
      </div>

      {/* Swap sheet */}
      <ResponsiveOverlay
        open={swapRole !== null}
        onOpenChange={(isOpen) => { if (!isOpen) { setSwapRole(null); setSwapTargetCartId(null); } }}
        layer="nested"
        title="Đổi món"
      >
        <div className="flex flex-col max-h-[60vh]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {swapRole && getScopes(swapRole).map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSwapSelect(s)}
                className="w-full flex items-center justify-between p-3 border rounded-xl bg-white text-left min-h-11"
              >
                <div>
                  <p className="font-bold text-sm">{s.menu_item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.allowed_sizes.length > 0 ? `Size ${s.allowed_sizes.join(", ")}` : "Add-on"}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="p-4 border-t">
            <button
              onClick={() => { setSwapRole(null); setSwapTargetCartId(null); }}
              className="w-full h-12 rounded-xl bg-secondary/20 text-primary font-bold"
            >
              Quay lại
            </button>
          </div>
        </div>
      </ResponsiveOverlay>
    </>
  );
}
