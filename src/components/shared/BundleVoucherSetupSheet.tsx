"use client";

import React, { useState, useCallback, useMemo } from "react";
import { ResponsiveOverlay, type OverlayLayer } from "@/src/components/ui/ResponsiveOverlay";
import Image from "next/image";
import { Plus, X, CheckCircle2, ChevronRight, Gift, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/src/lib/store/cartStore";
import {
  cartItemToBundleConfig,
  formatBundleSlotConfig,
} from "@/src/lib/utils/voucherUseNowHelpers";
import type { BundleItemConfig, BundleProductScope } from "@/src/lib/utils/voucherUseNowHelpers";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { MenuData, MenuItem, MilkTypeOption, Size } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import type { CartItem } from "@/src/lib/types/cart";
import type { BundleCreatedRewardEffect } from "@/src/lib/types/cart";
import { cn } from "@/src/utils/cn";
import ProductModal from "@/src/components/shared/ProductModal";

interface BundleVoucherSetupSheetProps {
  open: boolean;
  layer?: OverlayLayer;
  voucher: MyVoucher;
  menuData: MenuData;
  milkTypes: MilkTypeOption[];
  powders: Powder[];
  defaultPowderGram: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }>;
  onClose: () => void;
  onValidateDraft?: (input: {
    cartItems: CartItem[];
    rewardAllocations: BundleSelectionAllocation[];
  }) => { ok: true } | { ok: false; error: string };
  onSuccess: (
    bundleToken: string,
    allocations: BundleSelectionAllocation[],
    createdRewardEffects: BundleCreatedRewardEffect[],
  ) => void | { ok: true } | { ok: false; error: string };
}

type SlotRole = "qualifier" | "reward";
type BundleSlotConfig = BundleItemConfig & { sourceCartId?: string; sourceUnitIndex?: number };

type SubView =
  | null
  | { kind: "pick"; role: SlotRole; slotIndex: number }
  | { kind: "customize"; role: SlotRole; slotIndex: number; scope: BundleProductScope; menuItem: MenuItem };


/** Find the full MenuItem for a scope item. */
function findMenuItem(menuData: MenuData, menuItemId: string): MenuItem | undefined {
  return [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])].find(
    (i) => i.id === menuItemId,
  );
}

export const BundleVoucherSetupSheet = ({
  open,
  layer = "nested",
  voucher,
  menuData,
  milkTypes,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  powders: _powders,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultPowderGram: _defaultPowderGram,
  onClose,
  onValidateDraft,
  onSuccess,
}: BundleVoucherSetupSheetProps) => {
  const { addItem, removeItem, items } = useCartStore();
  const bundleRule = voucher.package.bundleRule;

  const qualifierScopes = useMemo(
    () => bundleRule?.qualifier_products.filter((p) => p.menu_item.is_available) ?? [],
    [bundleRule],
  );
  const rewardScopes = useMemo(() => {
    if (!bundleRule) return [];
    return bundleRule.reward_mode === "SAME_CONFIG"
      ? qualifierScopes
      : bundleRule.reward_products.filter((p) => p.menu_item.is_available);
  }, [bundleRule, qualifierScopes]);

  const initialSlots = useMemo(() => {
    const used = new Set<string>();
    const take = (scopes: BundleProductScope[], count: number): (BundleSlotConfig | null)[] => {
      const slots: BundleSlotConfig[] = [];
      for (const item of items) {
        const scope = scopes.find((candidate) => candidate.menu_item_id === item.menuItemId);
        if (!scope || item.productVoucherId || item.itemVoucherId || item.size === null || !scope.allowed_sizes.includes(item.size)) continue;
        for (let unitIndex = 0; unitIndex < item.quantity && slots.length < count; unitIndex += 1) {
          const unitKey = `${item.cartId}:${unitIndex}`;
          if (used.has(unitKey)) continue;
          used.add(unitKey);
          slots.push({ ...cartItemToBundleConfig(item, scope), sourceCartId: item.cartId, sourceUnitIndex: unitIndex });
        }
        if (slots.length === count) break;
      }
      return [...slots, ...Array<null>(Math.max(0, count - slots.length)).fill(null)];
    };
    return {
      qualifiers: take(qualifierScopes, bundleRule?.buy_quantity ?? 0),
      rewards: take(rewardScopes, bundleRule?.reward_quantity ?? 0),
    };
  }, [bundleRule, items, qualifierScopes, rewardScopes]);

  // N qualifier slots — array of null (empty) or filled BundleItemConfig
  const [qualifierSlots, setQualifierSlots] = useState<(BundleSlotConfig | null)[]>(() => initialSlots.qualifiers);

  // Reward slots — only when PRODUCT reward with ALLOWED_SCOPE / FIXED_CONFIG
  const needsRewardSlots =
    bundleRule?.reward_kind === "PRODUCT";
  const [rewardSlots, setRewardSlots] = useState<(BundleSlotConfig | null)[]>(() =>
    needsRewardSlots ? initialSlots.rewards : [],
  );

  const [subView, setSubView] = useState<SubView>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const qualifierFilled = qualifierSlots.filter(Boolean).length;
  const rewardFilled = rewardSlots.filter(Boolean).length;
  const qualifierComplete = bundleRule ? qualifierFilled === bundleRule.buy_quantity : false;
  const rewardComplete =
    !needsRewardSlots || (bundleRule ? rewardFilled === bundleRule.reward_quantity : false);
  const canConfirm = qualifierComplete && rewardComplete;

  // Reset on close
  const handleClose = useCallback(() => {
    setSubView(null);
    setQualifierSlots(initialSlots.qualifiers);
    setRewardSlots(needsRewardSlots ? initialSlots.rewards : []);
    onClose();
  }, [initialSlots, needsRewardSlots, onClose]);

  // ── Scope lists ───────────────────────────────────────────────────────────
  const currentScopes = subView?.kind === "pick"
    ? subView.role === "qualifier" ? qualifierScopes : rewardScopes
    : [];

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleProductModalConfirm = useCallback(
    (cartItem: CartItem) => {
      if (subView?.kind !== "customize") return;
      const { role, slotIndex, scope } = subView;
      const config = cartItemToBundleConfig(cartItem, scope);
      if (role === "qualifier") {
        setQualifierSlots((prev) => {
          const next = [...prev];
          next[slotIndex] = config;
          return next;
        });
      } else {
        setRewardSlots((prev) => {
          const next = [...prev];
          next[slotIndex] = config;
          return next;
        });
      }
      setSubView(null);
    },
    [subView],
  );

  const clearSlot = useCallback((role: SlotRole, idx: number) => {
    if (role === "qualifier") {
      setQualifierSlots((prev) => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
    } else {
      setRewardSlots((prev) => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
    }
  }, []);

  const editSlot = useCallback(
    (role: SlotRole, idx: number) => {
      const config = role === "qualifier" ? qualifierSlots[idx] : rewardSlots[idx];
      if (!config) return;
      const scopes = role === "qualifier" ? qualifierScopes : rewardScopes;
      const scope = scopes.find((s) => s.menu_item_id === config.menuItemId) ?? scopes[0];
      if (!scope) return;
      const menuItem = findMenuItem(menuData, config.menuItemId);
      if (!menuItem) return;
      setSubView({ kind: "customize", role, slotIndex: idx, scope, menuItem });
    },
    [qualifierSlots, rewardSlots, qualifierScopes, rewardScopes, menuData],
  );

  // ── Confirm (Sử dụng) ────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!bundleRule || !canConfirm) return;
    setSetupError(null);
    const toDraftItem = (config: BundleSlotConfig, cartId: string, role: SlotRole): CartItem => {
      const category = findMenuItem(menuData, config.menuItemId)?.category ?? "latte";
      const total = config.unitPriceVnd + config.addonsCost;
      return {
        cartId, menuItemId: config.menuItemId, name: config.name, category, imageUrl: config.imageUrl,
        size: config.size, unitPrice: total, quantity: 1, sweetness: config.sweetness,
        iceOption: config.iceOption, coldwhisk: config.coldwhisk, note: "",
        selectedOptionIds: config.selectedOptionIds, quantityMap: config.quantityMap,
        addonsPrice: config.addonsCost, addonPrices: config.addonPrices,
        quantityAddonOptions: config.quantityAddonOptions, clientPriceVnd: total, originalClientPriceVnd: total,
        ...(category === "fusion" && config.powderId ? { selectedPowderId: config.powderId } : {}),
        ...(category !== "extras" && config.baseLiquidId ? { selectedBaseLiquidId: config.baseLiquidId } : {}),
        ...(role === "qualifier" ? { bundleQualifierVoucherToken: voucher.qr_token } : { bundleRewardVoucherToken: voucher.qr_token }),
      };
    };
    const plannedQualifierIds = qualifierSlots.flatMap((config, index) => config
      ? [config.sourceCartId ?? `draft-qualifier-${index}`]
      : []);
    const plannedRewardAllocations: BundleSelectionAllocation[] = bundleRule.reward_kind === "ADDON"
      ? plannedQualifierIds.map((id) => ({ client_line_id: id, quantity: bundleRule.reward_quantity, addon_option_id: bundleRule.reward_addon_option_ids[0] }))
      : rewardSlots.flatMap((config, index) => config
          ? [{ client_line_id: config.sourceCartId ?? `draft-reward-${index}`, quantity: 1 }]
          : []);
    const plannedItems = [
      ...qualifierSlots.flatMap((config, index) => config && !config.sourceCartId ? [toDraftItem(config, `draft-qualifier-${index}`, "qualifier")] : []),
      ...rewardSlots.flatMap((config, index) => config && !config.sourceCartId ? [toDraftItem(config, `draft-reward-${index}`, "reward")] : []),
    ];
    const validation = onValidateDraft?.({ cartItems: [...items, ...plannedItems], rewardAllocations: plannedRewardAllocations });
    if (validation && !validation.ok) {
      setSetupError(validation.error);
      return;
    }
    const createdCartIds: string[] = [];
    const createdRewardCartIds: string[] = [];

    // Add qualifier items
    const qualifierCartIds: string[] = [];
    for (const config of qualifierSlots) {
      if (!config) continue;
      if (config.sourceCartId) {
        qualifierCartIds.push(config.sourceCartId);
        continue;
      }
      const menuItem = findMenuItem(menuData, config.menuItemId);
      const category = menuItem?.category ?? "latte";
      const cartId = addItem({
        menuItemId: config.menuItemId,
        name: config.name,
        category,
        imageUrl: config.imageUrl,
        size: config.size,
        unitPrice: config.unitPriceVnd + config.addonsCost,
        quantity: 1,
        sweetness: config.sweetness,
        iceOption: config.iceOption,
        coldwhisk: config.coldwhisk,
        note: "",
        selectedOptionIds: config.selectedOptionIds,
        quantityMap: config.quantityMap,
        addonsPrice: config.addonsCost,
        addonPrices: config.addonPrices,
        quantityAddonOptions: config.quantityAddonOptions,
        clientPriceVnd: config.unitPriceVnd + config.addonsCost,
        originalClientPriceVnd: config.unitPriceVnd + config.addonsCost,
        ...(category === "fusion" && config.powderId ? { selectedPowderId: config.powderId } : {}),
        ...(category !== "extras" && config.baseLiquidId ? { selectedBaseLiquidId: config.baseLiquidId } : {}),
        bundleQualifierVoucherToken: voucher.qr_token,
      });
      createdCartIds.push(cartId);
      qualifierCartIds.push(cartId);
    }

    // ADDON reward — attach to qualifier items
    if (bundleRule.reward_kind === "ADDON") {
      const rewardAddonId = bundleRule.reward_addon_option_ids[0];
      if (rewardAddonId) {
        const result = onSuccess(voucher.qr_token, qualifierCartIds.map((id) => ({
          client_line_id: id,
          quantity: bundleRule.reward_quantity,
          addon_option_id: rewardAddonId,
        })), []);
        if (result && !result.ok) {
          createdCartIds.forEach(removeItem);
          setSetupError(result.error);
        }
      }
      return;
    }

    // PRODUCT reward — SAME_CONFIG still uses explicitly distinct reward units.
    // PRODUCT reward — ALLOWED_SCOPE / FIXED_CONFIG: add separate reward items
    const rewardAllocations: BundleSelectionAllocation[] = [];
    for (const config of rewardSlots) {
      if (!config) continue;
      if (config.sourceCartId) {
        rewardAllocations.push({ client_line_id: config.sourceCartId, quantity: 1 });
        continue;
      }
      const menuItem = findMenuItem(menuData, config.menuItemId);
      const category = menuItem?.category ?? "latte";
      const rewardCartId = addItem({
        menuItemId: config.menuItemId,
        name: config.name,
        category,
        imageUrl: config.imageUrl,
        size: config.size,
        unitPrice: config.unitPriceVnd,
        quantity: 1,
        sweetness: config.sweetness,
        iceOption: config.iceOption,
        coldwhisk: config.coldwhisk,
        note: "",
        selectedOptionIds: config.selectedOptionIds,
        quantityMap: config.quantityMap,
        addonsPrice: config.addonsCost,
        addonPrices: config.addonPrices,
        quantityAddonOptions: config.quantityAddonOptions,
        clientPriceVnd: config.unitPriceVnd,
        originalClientPriceVnd: config.unitPriceVnd,
        ...(category === "fusion" && config.powderId ? { selectedPowderId: config.powderId } : {}),
        ...(category !== "extras" && config.baseLiquidId ? { selectedBaseLiquidId: config.baseLiquidId } : {}),
        bundleRewardVoucherToken: voucher.qr_token,
      });
      createdCartIds.push(rewardCartId);
      createdRewardCartIds.push(rewardCartId);
      rewardAllocations.push({ client_line_id: rewardCartId, quantity: 1 });
    }
    const createdRewardEffects: BundleCreatedRewardEffect[] = createdRewardCartIds.map((clientLineId) => ({
      kind: "LINE",
      client_line_id: clientLineId,
    }));
    const result = onSuccess(voucher.qr_token, rewardAllocations, createdRewardEffects);
    if (result && !result.ok) {
      createdCartIds.forEach(removeItem);
      setSetupError(result.error);
    }
  }, [addItem, bundleRule, canConfirm, items, menuData, onSuccess, onValidateDraft, qualifierSlots, removeItem, rewardSlots, voucher.qr_token]);

  if (!bundleRule) return null;

  // ── Render helpers ────────────────────────────────────────────────────────

  /** 3-column grid of slot cards for qualifier or reward. */
  const renderSlotGrid = (
    slots: (BundleItemConfig | null)[],
    role: SlotRole,
    isComplete: boolean,
  ) => (
    <div className="grid grid-cols-3 gap-2">
      {slots.map((config, idx) =>
        config ? (
          // Filled slot card
          <div
            key={idx}
            className="relative rounded-2xl overflow-hidden border-2 border-primary/20 bg-white shadow-sm cursor-pointer active:scale-[0.97] transition-transform"
            onClick={() => editSlot(role, idx)}
          >
            {/* Remove button */}
            <button
              type="button"
              aria-label="Xóa"
              onClick={(e) => {
                e.stopPropagation();
                clearSlot(role, idx);
              }}
              className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center"
            >
              <X className="w-3 h-3 text-white" />
            </button>
            {/* Image */}
            <div className="relative aspect-square w-full bg-secondary/10">
              {config.imageUrl ? (
                <Image src={config.imageUrl} alt={config.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-3xl">🍵</span>
                </div>
              )}
            </div>
            {/* Name + config */}
            <div className="p-2">
              <p className="text-[11px] font-bold text-primary leading-tight line-clamp-2">{config.name}</p>
              {formatBundleSlotConfig(config) && (
                <p className="text-[10px] text-primary/55 mt-0.5 line-clamp-1">
                  {formatBundleSlotConfig(config)}
                </p>
              )}
            </div>
          </div>
        ) : (
          // Empty slot card
          <button
            key={idx}
            type="button"
            disabled={role === "qualifier" ? isComplete : isComplete}
            onClick={() => setSubView({ kind: "pick", role, slotIndex: idx })}
            className={cn(
              "aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-opacity",
              isComplete
                ? "border-primary/10 opacity-30 cursor-not-allowed"
                : "border-primary/25 hover:border-primary/50 active:scale-[0.97]",
            )}
          >
            <Plus className="w-6 h-6 text-primary/40" />
            <span className="text-[10px] text-primary/40 font-medium">Thêm món</span>
          </button>
        ),
      )}
    </div>
  );

  /** List of scope items for the pick sub-view. */
  const renderScopeList = () => (
    <div className="flex-1 overflow-y-auto">
      {currentScopes.map((scope, idx) => {
        const menuItem = findMenuItem(menuData, scope.menu_item_id);
        return (
          <button
            key={idx}
            type="button"
            onClick={() =>
              setSubView((sv) =>
                sv?.kind === "pick"
                  ? { kind: "customize", role: sv.role, slotIndex: sv.slotIndex, scope, menuItem: menuItem! }
                  : sv,
              )
            }
            disabled={!menuItem}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/40 hover:bg-secondary/5 active:bg-secondary/10 disabled:opacity-40 text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary/10 relative overflow-hidden shrink-0">
              {menuItem?.image_url ? (
                <Image src={menuItem.image_url} alt={scope.menu_item.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">🍵</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-primary">{scope.menu_item.name}</p>
              <p className="text-xs text-primary/55 mt-0.5">
                {scope.allowed_sizes.length > 0
                  ? `Size ${scope.allowed_sizes.map((s) => (s === "SMALL" ? "S" : s === "MEDIUM" ? "M" : "L")).join(", ")}`
                  : "Add-on"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary/30 shrink-0" />
          </button>
        );
      })}
    </div>
  );

  // ── ProductModal sub-view ─────────────────────────────────────────────────
  if (subView?.kind === "customize") {
    const { scope, menuItem } = subView;
    const existingConfig =
      subView.role === "qualifier"
        ? qualifierSlots[subView.slotIndex]
        : rewardSlots[subView.slotIndex];

    // Build a CartItem stub for edit mode pre-population
    const editingItem: CartItem | undefined = existingConfig
      ? {
          cartId: `pending-${subView.role}-${subView.slotIndex}`,
          menuItemId: existingConfig.menuItemId,
          name: existingConfig.name,
          category: menuItem.category,
          imageUrl: existingConfig.imageUrl,
          size: existingConfig.size,
          unitPrice: existingConfig.unitPriceVnd,
          quantity: 1,
          sweetness: existingConfig.sweetness,
          iceOption: existingConfig.iceOption,
          coldwhisk: existingConfig.coldwhisk,
          note: "",
          selectedOptionIds: existingConfig.selectedOptionIds,
          quantityMap: existingConfig.quantityMap,
          addonsPrice: existingConfig.addonsCost,
          addonPrices: existingConfig.addonPrices,
          quantityAddonOptions: existingConfig.quantityAddonOptions,
          clientPriceVnd: existingConfig.unitPriceVnd,
          originalClientPriceVnd: existingConfig.unitPriceVnd,
          selectedBaseLiquidId: existingConfig.baseLiquidId ?? undefined,
          selectedPowderId: existingConfig.powderId ?? undefined,
        }
      : undefined;

    return (
      <ResponsiveOverlay
        open={open}
        onOpenChange={(isOpen) => !isOpen && setSubView(null)}
        layer={layer}
        title="Cấu hình món"
      >
        <ProductModal
          item={menuItem}
          latteItems={menuData.latte}
          milkTypes={milkTypes}
          addonGroups={menuData.addon_groups}
          onClose={() => setSubView(null)}
          onConfirm={handleProductModalConfirm}
          allowedSizes={scope.allowed_sizes as Size[]}
          disableVoucherApplication
          nested
          editingItem={editingItem}
          ctaLabel="Chọn món này"
        />
      </ResponsiveOverlay>
    );
  }

  // ── Pick sub-view (scope list) ────────────────────────────────────────────
  if (subView?.kind === "pick") {
    return (
      <ResponsiveOverlay
        open={open}
        onOpenChange={(isOpen) => !isOpen && setSubView(null)}
        layer={layer}
        title={subView.role === "qualifier" ? "Chọn món mua" : "Chọn món tặng"}
      >
        <div className="flex flex-col h-[65vh]">
          {renderScopeList()}
          <div className="p-4 border-t shrink-0">
            <button
              onClick={() => setSubView(null)}
              className="w-full h-12 rounded-xl bg-secondary/15 text-primary font-bold text-sm"
            >
              Quay lại
            </button>
          </div>
        </div>
      </ResponsiveOverlay>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  const addonRewardLabel = bundleRule.reward_kind === "ADDON"
    ? menuData.addon_groups
        .flatMap((g) => g.options)
        .find((o) => o.id === bundleRule.reward_addon_option_ids[0])?.label ?? "Free"
    : null;

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
      layer={layer}
      title="Chọn món cho ưu đãi"
    >
      <div className="flex flex-col">
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* ── QUALIFIER SECTION ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-primary/70 uppercase">
                {bundleRule.reward_mode === "SAME_CONFIG"
                  ? `Chọn món (${bundleRule.buy_quantity})`
                  : `Món mua (${bundleRule.buy_quantity})`}
              </h4>
              {qualifierComplete && (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đã đủ điều kiện
                </span>
              )}
            </div>
            {renderSlotGrid(qualifierSlots, "qualifier", qualifierComplete)}
          </div>

          {/* ── SAME_CONFIG benefit badge ── */}
          {bundleRule.reward_mode === "SAME_CONFIG" && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <Gift className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-800">
                Tặng {bundleRule.reward_quantity} món cùng loại với món đã chọn
              </p>
            </div>
          )}

          {/* ── ADDON reward ── */}
          {bundleRule.reward_kind === "ADDON" && (
            <>
              <div className="flex justify-center -my-2 relative z-10">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center border-4 border-white">
                  <Plus className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-primary/70 uppercase">🎁 Topping tặng</h4>
                <div className="p-4 border rounded-xl bg-orange-50/50 border-orange-100 text-center">
                  <span className="font-bold text-orange-600">Topping {addonRewardLabel}</span>
                </div>
              </div>
            </>
          )}

          {/* ── PRODUCT reward — ALLOWED_SCOPE / FIXED_CONFIG ── */}
          {needsRewardSlots && (
            <>
              <div className="flex justify-center -my-2 relative z-10">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center border-4 border-white">
                  <Plus className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-primary/70 uppercase">
                    Món tặng ({bundleRule.reward_quantity})
                  </h4>
                  {rewardComplete && (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Đã chọn
                    </span>
                  )}
                </div>
                {renderSlotGrid(rewardSlots, "reward", rewardComplete)}
              </div>
            </>
          )}
        </div>

        {/* ── BOTTOM CTA ── */}
        <div className="p-5 bg-white border-t border-border/40 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {setupError ? <p role="alert" className="mb-2 text-sm font-medium text-destructive">{setupError}</p> : null}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            Sử dụng
          </button>
        </div>
      </div>
    </ResponsiveOverlay>
  );
};
