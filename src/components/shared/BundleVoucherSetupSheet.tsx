"use client";

import React, { useState, useEffect } from "react";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import Image from "next/image";
import { Plus } from "lucide-react";
import { useCartStore } from "@/src/lib/store/cartStore";
import { buildBundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import type { BundleItemConfig } from "@/src/lib/utils/voucherUseNowHelpers";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { MenuData, MilkTypeOption } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { computeVoucherItemPrice } from "@/src/hooks/useAddVoucherToCart";

interface BundleVoucherSetupSheetProps {
  open: boolean;
  voucher: MyVoucher;
  menuData: MenuData;
  milkTypes: MilkTypeOption[];
  powders: Powder[];
  defaultPowderGram: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }>;
  onClose: () => void;
  onSuccess: (bundleToken: string, allocations: BundleSelectionAllocation[]) => void;
}

export const BundleVoucherSetupSheet = ({
  open,
  voucher,
  menuData,
  milkTypes,
  powders,
  defaultPowderGram,
  onClose,
  onSuccess,
}: BundleVoucherSetupSheetProps) => {
  const { addItem } = useCartStore();
  const [qualifierConfig, setQualifierConfig] = useState<BundleItemConfig | null>(null);
  const [rewardConfig, setRewardConfig] = useState<BundleItemConfig | null>(null);
  const [subView, setSubView] = useState<null | "swap_qualifier" | "swap_reward">(null);

  const bundleRule = voucher.package.bundleRule;

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setSubView(null));
      return;
    }
    if (!bundleRule) return;
    const allItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
    const resolveConfig = (product: typeof bundleRule.qualifier_products[number]) => {
      const item = allItems.find((candidate) => candidate.id === product.menu_item_id);
      if (!item || !product.menu_item.is_available) return null;
      const initial = buildBundleItemConfig(product, item, milkTypes);
      if (item.category === "extras") {
        return { ...initial, unitPriceVnd: item.unit_price_vnd ?? 0 };
      }
      if (!initial.size) return null;
      const price = computeVoucherItemPrice(
        item, initial.size, initial.powderId, initial.baseLiquidId ?? null, [], powders,
        defaultPowderGram, menuData.latte, milkTypes, menuData.addon_groups,
      ).drinkPrice;
      return { ...initial, unitPriceVnd: price };
    };
    const cheapest = (products: typeof bundleRule.qualifier_products) => products
      .map(resolveConfig)
      .filter((config): config is BundleItemConfig => config !== null)
      .sort((left, right) => left.unitPriceVnd - right.unitPriceVnd)[0] ?? null;
    const qualifier = cheapest(bundleRule.qualifier_products);
    const rewardDerived = bundleRule.reward_kind === "PRODUCT"
      ? (bundleRule.reward_mode === "SAME_CONFIG" ? qualifier : cheapest(bundleRule.reward_products))
      : null;
    queueMicrotask(() => {
      setQualifierConfig(qualifier);
      setRewardConfig(rewardDerived);
    });
  }, [open, bundleRule, milkTypes, powders, defaultPowderGram, menuData]);

  if (!bundleRule) return null;

  const handleConfirm = () => {
    if (!qualifierConfig) return;
    if (bundleRule.reward_kind === "PRODUCT" && !rewardConfig) return;

    const allMenuItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
    const qMenuItem = allMenuItems.find(i => i.id === qualifierConfig.menuItemId);
    const qCategory = qMenuItem?.category ?? "latte";

    let qSelectedOptionIds: string[] = [];
    let qAddonPrices: Record<string, number> = {};
    let qAddonsPrice = 0;

    if (bundleRule.reward_kind === "ADDON") {
      const rewardAddonId = bundleRule.reward_addon_option_ids[0];
      if (rewardAddonId) {
        const group = menuData.addon_groups.find(g => g.options.some(o => o.id === rewardAddonId));
        const option = group?.options.find(o => o.id === rewardAddonId);
        // Note: For simplicity we assume price_vnd. If it's extra matcha, it might use gram_value but addon rewards are usually fixed toppings.
        const price = option?.price_vnd ?? 0;
        
        qSelectedOptionIds = [rewardAddonId];
        qAddonPrices = { [rewardAddonId]: price };
        qAddonsPrice = price;
      }
    }
    
    const qualifierCartId = addItem({
      menuItemId: qualifierConfig.menuItemId,
      name: qualifierConfig.name,
      category: qCategory,
      imageUrl: qualifierConfig.imageUrl,
      size: qualifierConfig.size,
      unitPrice: qualifierConfig.unitPriceVnd + qAddonsPrice,
      quantity: bundleRule.buy_quantity,
      sweetness: qualifierConfig.sweetness,
      iceOption: qualifierConfig.iceOption,
      coldwhisk: qualifierConfig.coldwhisk,
      note: "",
      selectedOptionIds: qSelectedOptionIds,
      quantityMap: {},
      addonsPrice: qAddonsPrice,
      addonPrices: qAddonPrices,
      quantityAddonOptions: [],
      clientPriceVnd: qualifierConfig.unitPriceVnd + qAddonsPrice,
      originalClientPriceVnd: qualifierConfig.unitPriceVnd + qAddonsPrice,
      bundleQualifierVoucherToken: voucher.qr_token,
    });

    if (bundleRule.reward_kind === "PRODUCT" && rewardConfig) {
      const rMenuItem = allMenuItems.find(i => i.id === rewardConfig.menuItemId);
      const rewardCartId = addItem({
        menuItemId: rewardConfig.menuItemId,
        name: rewardConfig.name,
        category: rMenuItem?.category ?? "latte",
        imageUrl: rewardConfig.imageUrl,
        size: rewardConfig.size,
        unitPrice: rewardConfig.unitPriceVnd,
        quantity: bundleRule.reward_quantity,
        sweetness: rewardConfig.sweetness,
        iceOption: rewardConfig.iceOption,
        coldwhisk: rewardConfig.coldwhisk,
        note: "",
        selectedOptionIds: [],
        quantityMap: {},
        addonsPrice: 0,
        addonPrices: {},
        quantityAddonOptions: [],
        clientPriceVnd: rewardConfig.unitPriceVnd,
        originalClientPriceVnd: rewardConfig.unitPriceVnd,
        bundleRewardVoucherToken: voucher.qr_token,
      });

      onSuccess(voucher.qr_token, [{
        client_line_id: rewardCartId,
        quantity: bundleRule.reward_quantity,
      }]);
    } else if (bundleRule.reward_kind === "ADDON") {
      onSuccess(voucher.qr_token, [{
        client_line_id: qualifierCartId,
        quantity: bundleRule.reward_quantity,
        addon_option_id: bundleRule.reward_addon_option_ids[0],
      }]);
    }
  };

  const renderItemCard = (config: BundleItemConfig | null, role: "QUALIFIER" | "REWARD") => {
    if (!config) return <div className="p-4 border rounded-xl text-center text-muted-foreground">Chưa có món phù hợp</div>;
    return (
      <div className="flex items-center gap-3 p-3 border rounded-xl bg-white shadow-sm">
        <div className="w-14 h-14 bg-secondary/10 rounded-lg relative overflow-hidden shrink-0">
          {config.imageUrl && <Image src={config.imageUrl} alt={config.name} fill className="object-cover" />}
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm text-primary">{config.name}</p>
          <p className="text-xs text-primary/60">Size {config.size}</p>
          <p className="text-sm font-bold mt-1">{(config.unitPriceVnd / 1000).toLocaleString("vi-VN")}K</p>
        </div>
        <button 
          onClick={() => setSubView(role === "QUALIFIER" ? "swap_qualifier" : "swap_reward")}
          className="min-h-11 px-3 rounded-full bg-secondary/10 text-primary text-xs font-bold whitespace-nowrap"
        >
          Đổi món
        </button>
      </div>
    );
  };

  const renderScopeList = () => {
    const role = subView === "swap_qualifier" ? "QUALIFIER" : "REWARD";
    const scopes = (role === "QUALIFIER"
      ? bundleRule.qualifier_products
      : bundleRule.reward_mode === "SAME_CONFIG"
        ? bundleRule.qualifier_products
        : bundleRule.reward_products
    ).filter((product) => product.menu_item.is_available);
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {scopes.map((s, idx) => {
          return (
            <button
              key={idx}
              onClick={() => {
                const allItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
                const fullItem = allItems.find(i => i.id === s.menu_item_id);
                if (!fullItem) return;
                const initial = buildBundleItemConfig(s, fullItem, milkTypes);
                const unitPriceVnd = fullItem.category === "extras"
                  ? fullItem.unit_price_vnd ?? 0
                  : initial.size
                    ? computeVoucherItemPrice(
                        fullItem, initial.size, initial.powderId, initial.baseLiquidId ?? null,
                        [], powders, defaultPowderGram, menuData.latte, milkTypes,
                        menuData.addon_groups,
                      ).drinkPrice
                    : 0;
                const conf = { ...initial, unitPriceVnd };
                if (role === "QUALIFIER") setQualifierConfig(conf);
                else setRewardConfig(conf);
                setSubView(null);
              }}
              className="w-full flex items-center justify-between p-3 border rounded-xl bg-white text-left"
            >
              <div>
                <p className="font-bold text-sm">{s.menu_item.name}</p>
                <p className="text-xs text-muted-foreground">{s.allowed_sizes.length > 0 ? `Size ${s.allowed_sizes.join(", ")}` : "Add-on"}</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const isBtnDisabled = !qualifierConfig || (bundleRule.reward_kind === "PRODUCT" && !rewardConfig);

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      layer="nested"
      title={subView ? "Đổi món" : "Chọn món cho ưu đãi"}
    >
      {subView ? (
        <div className="flex flex-col h-[60vh]">
          {renderScopeList()}
          <div className="p-4 border-t">
            <button onClick={() => setSubView(null)} className="w-full h-12 rounded-xl bg-secondary/20 text-primary font-bold">
              Quay lại
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="p-5 space-y-6">
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-primary/70 uppercase">Món mua ({bundleRule.buy_quantity})</h4>
              {renderItemCard(qualifierConfig, "QUALIFIER")}
            </div>
            
            <div className="flex justify-center -my-2 relative z-10">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center border-4 border-white">
                <Plus className="w-4 h-4 text-orange-600" />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-sm text-primary/70 uppercase">Món tặng ({bundleRule.reward_quantity})</h4>
              {bundleRule.reward_kind === "ADDON" ? (
                <div className="p-4 border rounded-xl bg-orange-50/50 border-orange-100 text-center">
                  <span className="font-bold text-orange-600">
                    Topping {menuData.addon_groups.flatMap((group) => group.options)
                      .find((option) => option.id === bundleRule.reward_addon_option_ids[0])?.label ?? "Free"}
                  </span>
                </div>
              ) : (
                renderItemCard(rewardConfig, "REWARD")
              )}
            </div>
          </div>

          <div className="p-5 bg-white border-t border-border/40 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              onClick={handleConfirm}
              disabled={isBtnDisabled}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
            >
              Thêm vào giỏ và áp ưu đãi
            </button>
          </div>
        </div>
      )}
    </ResponsiveOverlay>
  );
};
