"use client";

import React, { useState, useCallback, useMemo } from "react";
import { ResponsiveOverlay, type OverlayLayer } from "@/src/components/ui/ResponsiveOverlay";
import Image from "next/image";
import { Plus, X, CheckCircle2, ChevronRight, Gift, ShoppingBag } from "lucide-react";
import {
  cartItemToBundleConfig,
  formatBundleSlotConfig,
} from "@/src/lib/utils/voucherUseNowHelpers";
import type { BundleItemConfig, BundleProductScope } from "@/src/lib/utils/voucherUseNowHelpers";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { MenuData, MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import type { CartBundleApplication, BundleCartDraftCommit, CartItem } from "@/src/lib/types/cart";
import { buildBundleCartDraft, type BundleAddonRecipientSlot, type BundleCartDraftResult, type BundleDraftSlot, type BundleCartDraftValidation } from "@/src/lib/utils/bundleCartDraft";
import { getBundleRequiredQuantities } from "@/src/utils/bundleSelection";
import { cn } from "@/src/utils/cn";
import ProductModal from "@/src/components/shared/ProductModal";

interface BundleVoucherSetupSheetProps {
  open: boolean;
  layer?: OverlayLayer;
  voucher: MyVoucher;
  cartItems: CartItem[];
  initialApplication?: CartBundleApplication;
  menuData: MenuData;
  milkTypes: MilkTypeOption[];
  powders: Powder[];
  defaultPowderGram: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }>;
  onClose: () => void;
  onValidateDraft: (draft: BundleCartDraftResult) => BundleCartDraftValidation;
  onCommitDraft: (draft: BundleCartDraftCommit) => void;
  onSuccess: () => void;
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
  cartItems,
  initialApplication,
  menuData,
  milkTypes,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  powders: _powders,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultPowderGram: _defaultPowderGram,
  onClose,
  onValidateDraft,
  onCommitDraft,
  onSuccess,
}: BundleVoucherSetupSheetProps) => {
  const items = cartItems;
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
    const allocationQuantities = new Map<string, number>();
    for (const allocation of [
      ...(initialApplication?.qualifier_allocations ?? []),
      ...(initialApplication?.reward_allocations ?? []),
    ]) {
      if (!allocation.addon_option_id) {
        allocationQuantities.set(
          allocation.client_line_id,
          (allocationQuantities.get(allocation.client_line_id) ?? 0) + allocation.quantity,
        );
      }
    }
    const take = (scopes: BundleProductScope[], count: number, role: SlotRole): (BundleSlotConfig | null)[] => {
      const slots: BundleSlotConfig[] = [];
      const orderedItems = [...items].sort((left, right) =>
        Number(allocationQuantities.has(right.cartId)) - Number(allocationQuantities.has(left.cartId)),
      );
      for (const item of orderedItems) {
        const scope = scopes.find((candidate) => candidate.menu_item_id === item.menuItemId);
        if (role === "qualifier" && item.bundleRewardVoucherToken === voucher.qr_token) continue;
        if (role === "reward" && item.bundleQualifierVoucherToken === voucher.qr_token) continue;
        if (!scope || item.productVoucherId || item.itemVoucherId || item.addonVouchers?.length || item.size === null || !scope.allowed_sizes.includes(item.size)) continue;
        const preferredQuantity = allocationQuantities.get(item.cartId);
        const availableQuantity = preferredQuantity ?? item.quantity;
        for (let unitIndex = 0; unitIndex < availableQuantity && slots.length < count; unitIndex += 1) {
          const unitKey = `${item.cartId}:${unitIndex}`;
          if (used.has(unitKey)) continue;
          used.add(unitKey);
          slots.push({ ...cartItemToBundleConfig(item, scope), sourceCartId: item.cartId, sourceUnitIndex: unitIndex });
        }
        if (slots.length === count) break;
      }
      return [...slots, ...Array<null>(Math.max(0, count - slots.length)).fill(null)];
    };
    const qualifierCount = bundleRule?.reward_kind === "ADDON" && bundleRule.benefit_scaling !== "ONCE_PER_ORDER"
      ? (bundleRule.buy_quantity * bundleRule.max_applications_per_order)
      : (bundleRule?.buy_quantity ?? 0);
    const existingQualifierCount = initialApplication?.qualifier_allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) ?? 0;
    const qualifierFillCount = bundleRule?.reward_kind === "ADDON" && bundleRule.benefit_scaling !== "ONCE_PER_ORDER"
      ? Math.min(qualifierCount, Math.max(bundleRule.buy_quantity, existingQualifierCount))
      : qualifierCount;
    const qualifiers = take(qualifierScopes, qualifierFillCount, "qualifier");
    return {
      qualifiers: [...qualifiers, ...Array<null>(Math.max(0, qualifierCount - qualifiers.length)).fill(null)],
      rewards: take(rewardScopes, bundleRule?.reward_quantity ?? 0, "reward"),
    };
  }, [bundleRule, initialApplication, items, qualifierScopes, rewardScopes, voucher.qr_token]);

  // N qualifier slots — array of null (empty) or filled BundleItemConfig
  const [qualifierSlots, setQualifierSlots] = useState<(BundleSlotConfig | null)[]>(() => initialSlots.qualifiers);

  // Reward slots — only when PRODUCT reward with ALLOWED_SCOPE / FIXED_CONFIG
  const needsRewardSlots =
    bundleRule?.reward_kind === "PRODUCT";
  const [rewardSlots, setRewardSlots] = useState<(BundleSlotConfig | null)[]>(() =>
    needsRewardSlots ? initialSlots.rewards : [],
  );

  const addonChoices = useMemo(() => {
    if (!bundleRule || bundleRule.reward_kind !== "ADDON") return [];
    const allowed = new Set(bundleRule.reward_addon_option_ids);
    return menuData.addon_groups.flatMap((group) => group.options
      .filter((option) => allowed.has(option.id))
      .map((option) => ({ group, option, valid: !group.is_dynamic_gram && option.gram_value === null })));
  }, [bundleRule, menuData.addon_groups]);
  const addonRecipientSlots = useMemo<readonly (BundleAddonRecipientSlot | null)[]>(() => {
    if (!bundleRule || bundleRule.reward_kind !== "ADDON") return [];
    return items.flatMap((item) => {
      const scope = qualifierScopes.find((candidate) => candidate.menu_item_id === item.menuItemId);
      if (!scope || item.bundleRewardVoucherToken || item.productVoucherId || item.itemVoucherId || item.addonVouchers?.length || item.size === null || !scope.allowed_sizes.includes(item.size)) return [];
      const config = cartItemToBundleConfig(item, scope);
      return Array.from({ length: item.quantity }, (_, sourceUnitIndex) => ({ config, sourceCartId: item.cartId, sourceUnitIndex }));
    });
  }, [bundleRule, items, qualifierScopes]);
  const initialAddonState = useMemo<{ optionId: string | null; recipientSlotIndexes: number[] }>(() => {
    if (!bundleRule || bundleRule.reward_kind !== "ADDON") return { optionId: null, recipientSlotIndexes: [] };
    const allowed = new Set(bundleRule.reward_addon_option_ids);
    const optionId = initialApplication?.reward_allocations.find((allocation) => allocation.addon_option_id && allowed.has(allocation.addon_option_id))?.addon_option_id ?? null;
    const used = new Set<number>();
    const recipientSlotIndexes: number[] = [];
    for (const allocation of initialApplication?.reward_allocations ?? []) {
      if (!allocation.addon_option_id || allocation.addon_option_id !== optionId) continue;
      for (let count = 0; count < allocation.quantity; count += 1) {
        const index = addonRecipientSlots.findIndex((slot, slotIndex) => slot?.sourceCartId === allocation.client_line_id && !used.has(slotIndex));
        if (index < 0) break;
        used.add(index);
        recipientSlotIndexes.push(index);
      }
    }
    return { optionId, recipientSlotIndexes };
  }, [addonRecipientSlots, bundleRule, initialApplication]);
  const [addonOptionId, setAddonOptionId] = useState<string | null>(() => initialAddonState.optionId);
  const [addonRecipientSlotIndexes, setAddonRecipientSlotIndexes] = useState<number[]>(() => initialAddonState.recipientSlotIndexes);

  const [subView, setSubView] = useState<SubView>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const qualifierFilled = qualifierSlots.filter(Boolean).length;
  const rewardFilled = rewardSlots.filter(Boolean).length;
  const addonRequired = bundleRule?.reward_kind === "ADDON"
    ? getBundleRequiredQuantities(bundleRule, qualifierFilled)
    : null;
  const validAddonRecipientIndexes = addonRecipientSlotIndexes.filter((index) => Boolean(addonRecipientSlots[index]));
  const qualifierComplete = bundleRule?.reward_kind === "ADDON"
    ? Boolean(addonRequired?.valid)
    : bundleRule ? qualifierFilled === bundleRule.buy_quantity : false;
  const rewardComplete =
    !needsRewardSlots || (bundleRule ? rewardFilled === bundleRule.reward_quantity : false);
  const addonComplete = bundleRule?.reward_kind !== "ADDON"
    || Boolean(addonOptionId && addonRequired?.valid && validAddonRecipientIndexes.length === addonRequired.rewards);
  const canConfirm = qualifierComplete && rewardComplete && addonComplete;

  // Reset on close
  const handleClose = useCallback(() => {
    setSubView(null);
    setQualifierSlots(initialSlots.qualifiers);
    setRewardSlots(needsRewardSlots ? initialSlots.rewards : []);
    setAddonOptionId(initialAddonState.optionId);
    setAddonRecipientSlotIndexes(initialAddonState.recipientSlotIndexes);
    onClose();
  }, [initialAddonState, initialSlots, needsRewardSlots, onClose]);

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

  const toggleAddonRecipient = useCallback((slotIndex: number) => {
    if (!addonRecipientSlots[slotIndex] || !addonRequired?.valid) return;
    setAddonRecipientSlotIndexes((previous) => previous.includes(slotIndex)
      ? previous.filter((index) => index !== slotIndex)
      : previous.length < addonRequired.rewards ? [...previous, slotIndex] : previous);
  }, [addonRecipientSlots, addonRequired]);

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
    const toDraftSlots = (slots: readonly (BundleSlotConfig | null)[], role: "qualifier" | "reward"): (BundleDraftSlot | null)[] =>
      slots.map((config) => config ? { role, config, sourceCartId: config.sourceCartId, sourceUnitIndex: config.sourceUnitIndex } : null);
    try {
      const candidate = buildBundleCartDraft({
        items,
        voucher_qr_token: voucher.qr_token,
        qualifierSlots: toDraftSlots(qualifierSlots, "qualifier"),
        rewardSlots: toDraftSlots(rewardSlots, "reward"),
        rewardKind: bundleRule.reward_kind,
        rewardQuantity: bundleRule.reward_quantity,
        ...(bundleRule.reward_kind === "ADDON" ? { addonRecipientSlots } : {}),
        ...(bundleRule.reward_kind === "ADDON" ? {
          addonReward: {
            optionId: addonOptionId,
            allowedOptionIds: bundleRule.reward_addon_option_ids,
            recipientSlotIndexes: validAddonRecipientIndexes,
            benefitScaling: bundleRule.benefit_scaling,
            buyQuantity: bundleRule.buy_quantity,
            rewardQuantity: bundleRule.reward_quantity,
            maxApplicationsPerOrder: bundleRule.max_applications_per_order,
            maxRewardUnitsPerOrder: bundleRule.max_reward_units_per_order,
            addonGroups: menuData.addon_groups,
          },
        } : {}),
        existingApplication: initialApplication,
      });
      const validation = onValidateDraft(candidate);
      if (!validation.ok) {
        setSetupError(validation.error);
        return;
      }
      onCommitDraft(validation.draft);
      onSuccess();
    } catch (error: unknown) {
      setSetupError(error instanceof Error ? error.message : "Không thể chuẩn bị ưu đãi BUNDLE");
    }
  }, [addonOptionId, addonRecipientSlots, bundleRule, canConfirm, initialApplication, items, menuData.addon_groups, onCommitDraft, onSuccess, onValidateDraft, qualifierSlots, rewardSlots, validAddonRecipientIndexes, voucher.qr_token]);

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
            disabled={role === "qualifier" ? (isComplete && bundleRule?.reward_kind !== "ADDON") : isComplete}
            onClick={() => setSubView({ kind: "pick", role, slotIndex: idx })}
            className={cn(
              "aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-opacity",
              (isComplete && !(role === "qualifier" && bundleRule?.reward_kind === "ADDON"))
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
    <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none">
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
          addonsPrice: existingConfig.addonsCost,
          addonPrices: existingConfig.addonPrices,
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
          allowedSizes={scope.allowed_sizes}
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
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
      layer={layer}
      title="Chọn món cho ưu đãi"
    >
      <div className="flex flex-col">
        <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none p-5 space-y-6">

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
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-primary/70 uppercase">🎁 Chọn topping tặng</h4>
                  {addonRequired?.valid ? <span className="text-xs font-semibold text-primary/60">{addonRecipientSlotIndexes.length}/{addonRequired.rewards} đơn vị</span> : null}
                </div>
                <div className="grid gap-2">
                  {addonChoices.map(({ group, option, valid }) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!valid}
                      aria-pressed={addonOptionId === option.id}
                      onClick={() => setAddonOptionId(option.id)}
                      className={cn(
                        "min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold",
                        addonOptionId === option.id ? "border-orange-600 bg-orange-50 text-orange-900" : "border-orange-200 bg-white",
                        !valid && "cursor-not-allowed opacity-45",
                      )}
                    >
                      <span>{option.label}</span>
                      <span className="ml-2 text-xs font-normal text-primary/55">{group.name}</span>
                      {!valid ? <span className="mt-0.5 block text-xs font-normal text-red-700">Không hỗ trợ Extra Matcha</span> : null}
                    </button>
                  ))}
                </div>
                {addonOptionId && addonRequired?.valid ? (
                  <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                    <p className="text-xs font-bold text-orange-900">Chọn món mua nhận topping</p>
                    <div className="grid grid-cols-2 gap-2">
                      {addonRecipientSlots.map((slot, index) => slot ? (
                        <button
                          key={`recipient-${index}`}
                          type="button"
                          aria-pressed={addonRecipientSlotIndexes.includes(index)}
                          onClick={() => toggleAddonRecipient(index)}
                          className={cn(
                            "min-h-11 rounded-lg border bg-white px-2 py-2 text-left text-xs font-semibold",
                            addonRecipientSlotIndexes.includes(index) ? "border-orange-600 bg-orange-100 text-orange-900" : "border-orange-200 text-primary/75",
                          )}
                        >
                          {index + 1}. {slot.config.name}
                        </button>
                      ) : null)}
                    </div>
                  </div>
                ) : null}
                {!addonChoices.some((choice) => choice.valid) ? <p className="text-xs text-red-700">Addon thưởng hiện không hợp lệ.</p> : null}
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
          {setupError ? (
            <div role="alert" className="mb-2 space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm font-medium text-destructive">{setupError}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSetupError(null); setSubView({ kind: "pick", role: "qualifier", slotIndex: 0 }); }}
                  className="min-h-11 flex-1 rounded-lg border border-red-300 bg-white px-2 text-xs font-bold text-red-800"
                >
                  Đổi món mua
                </button>
                {needsRewardSlots ? (
                  <button
                    type="button"
                    onClick={() => { setSetupError(null); setSubView({ kind: "pick", role: "reward", slotIndex: 0 }); }}
                    className="min-h-11 flex-1 rounded-lg border border-red-300 bg-white px-2 text-xs font-bold text-red-800"
                  >
                    Đổi món tặng
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
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
