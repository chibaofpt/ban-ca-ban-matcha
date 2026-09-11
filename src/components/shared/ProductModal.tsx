"use client";

import React, { useState, useCallback, useMemo, Profiler, useSyncExternalStore } from "react";
import Image from "next/image";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { Drawer } from "vaul";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Minus, Plus, Ticket, CheckCircle2, ArrowLeft } from "lucide-react";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { filterUsableVouchers, getAddonVoucherTargetChoices, getCartAddonVoucherTargets, isVoucherUsable, resolveAddonVoucherOptionId } from "@/src/utils/voucherMatchUtils";
import type { AddonGroup, MenuItem, MilkTypeOption, SweetnessLevel, Size } from "@/src/lib/types/menu";
import type { IceOption, CartItem, ProjectedCartLine } from "@/src/lib/types/cart";
import { useCartStore } from "@/src/lib/store/cartStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { cn } from "@/src/utils/cn";
import { ceilTo1000 } from "@/src/utils/pricing";
import { formatKa } from "@/src/utils/display";
import { SWEETNESS_OPTIONS, ICE_OPTIONS } from "@/src/constants/orderOptions";
import { usePriceMap } from "./product-modal/usePriceMap";
import { SizeSelector } from "./product-modal/SizeSelector";
import { MilkSelector } from "./product-modal/MilkSelector";
import { PowderSelector } from "./product-modal/PowderSelector";
import { ModalBottomCTA } from "./product-modal/ModalBottomCTA";
import { useModalHistory } from "./product-modal/useModalHistory";
import { SectionLabel } from "./product-modal/SectionLabel";
import OptionCard from "./product-modal/OptionCard";
import { getBaseLiquidOptionsForItem } from "@/src/utils/baseLiquid";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";

interface ProductModalProps {
  item: MenuItem;
  latteItems: MenuItem[];
  milkTypes: MilkTypeOption[];
  addonGroups: AddonGroup[];
  onClose: () => void;
  // ── Edit mode ──
  editingItem?: ProjectedCartLine;
  // ── Staff mode ──
  onConfirm?: (item: CartItem, projection?: ProjectedCartLine) => CartMutationResult<unknown> | void;
  freeVoucherId?: string;
  freeVoucherCoveredPriceVnd?: number;
  availableVouchers?: MyVoucher[];
  /** Keep personal-voucher controls read-only while the customer wallet is unverified. */
  walletVerified?: boolean;
  /** Explain why personal-voucher controls or an edit save are temporarily locked. */
  walletReadOnlyReason?: string;
  // ── Drawer UI ──
  nested?: boolean;
  currentCartItems?: CartItem[];
  // ── Bundle Selection ──
  allowedSizes?: Size[];
  disableVoucherApplication?: boolean;
  /** Optional CTA button label override (e.g. "Chọn món này" in bundle context). */
  ctaLabel?: string;
  initialSize?: Size | null;
  initialPowderId?: string | null;
  initialBaseLiquidId?: string | null;
}

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const subscribeToDesktopViewport = (onChange: () => void) => {
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getDesktopSnapshot = () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
const getDesktopServerSnapshot = () => false;

/** Resolve an addon option image (removed legacy group-image fallback per user request). */
export function resolveAddonOptionImage(
  optionImageUrl: string | null,
): string | null {
  return optionImageUrl;
}

// Extracted OptionCard, SizeSelector, MilkSelector, PowderSelector are imported

const BaseModal: React.FC<ProductModalProps> = ({ 
  item, latteItems, milkTypes, addonGroups, onClose, editingItem, onConfirm, freeVoucherId,
  freeVoucherCoveredPriceVnd, availableVouchers, nested = false, currentCartItems,
  allowedSizes, disableVoucherApplication, ctaLabel, initialSize, initialPowderId, initialBaseLiquidId,
  walletVerified = true, walletReadOnlyReason = "Ví voucher đang được xác minh. Vui lòng thử lại sau một chút.",
}) => {
  const editingConfig = editingItem?.configuration;
  const [isOpen, setIsOpen] = useState(true);
  // Global state
  const addItem = useCartStore(s => s.addItem);
  const updateItem = useCartStore(s => s.updateItem);
  const pendingAddonVoucher = useCartStore(s => s.pendingAddonVoucher);
  const setPendingAddonVoucher = useCartStore(s => s.setPendingAddonVoucher);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  // ── Desktop / Responsive Detection ──
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopViewport,
    getDesktopSnapshot,
    getDesktopServerSnapshot
  );

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedSize, setSelectedSize] = useState<Size>(() => {
    if (editingConfig?.size) return editingConfig.size;
    const available = item.sizes ?? [];
    const displaySizes = allowedSizes ? available.filter(s => allowedSizes.includes(s.size)) : available;
    if (initialSize && displaySizes.some((row) => row.size === initialSize)) return initialSize;
    return (displaySizes.find((s) => s.size === "MEDIUM") ?? displaySizes[0])?.size ?? "SMALL";
  });
  const [sweetness, setSweetness] = useState<SweetnessLevel>(() => editingConfig?.size !== null && editingConfig ? editingConfig.sweetness : "FULL");
  const [iceOption, setIceOption] = useState<IceOption>(() => editingConfig?.size !== null && editingConfig ? editingConfig.iceOption : "NORMAL");
  const [coldwhisk, setColdwhisk] = useState(() => editingConfig?.size !== null && editingConfig ? editingConfig.coldwhisk : false);
  const [selectedPowderId, setSelectedPowderId] = useState<string>(() => editingConfig?.size !== null ? editingConfig?.powderId ?? initialPowderId ?? item.resolved_default_powder_id ?? "" : initialPowderId ?? item.resolved_default_powder_id ?? "");
  const [selectedMilkId, setSelectedMilkId] = useState<string>(() => {
    if (editingConfig?.size !== null && editingConfig?.baseLiquidId) return editingConfig.baseLiquidId;
    return initialBaseLiquidId ?? item.default_base_liquid_id ?? "";
  });
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() => {
    const validOptionIds = new Set(
      addonGroups.flatMap((group) => group.options.map((option) => option.id))
    );
    if (editingItem) {
      return editingConfig?.size === null ? [] : (editingConfig?.addonOptionIds ?? []).filter((id) => validOptionIds.has(id));
    }
    return [];
  });

  const [quantity, setQuantity] = useState(() => {
    const startsWithVoucher =
      editingItem?.lineVoucher !== undefined ||
      (editingItem?.addonVouchers?.length ?? 0) > 0 ||
      freeVoucherId !== undefined ||
      pendingAddonVoucher !== null;
    return startsWithVoucher ? 1 : editingItem?.quantity ?? 1;
  });
  const [note, setNote] = useState(() => editingConfig?.note ?? "");

  const [selectedProductVoucherId, setSelectedProductVoucherId] = useState<string | null>(() => editingItem?.lineVoucher?.token ?? null);
  const [selectedAddonVoucherTargets, setSelectedAddonVoucherTargets] = useState<Record<string, string>>(
    () => getCartAddonVoucherTargets(editingItem),
  );
  const [addonChoiceVoucherId, setAddonChoiceVoucherId] = useState<string | null>(null);
  const selectedAddonVoucherIds = useMemo(
    () => Object.entries(selectedAddonVoucherTargets)
      .filter(([, addonOptionId]) => selectedOptionIds.includes(addonOptionId))
      .map(([voucherId]) => voucherId),
    [selectedAddonVoucherTargets, selectedOptionIds],
  );
  const [pendingAddonConflict, setPendingAddonConflict] = useState<{ item: Omit<CartItem, "cartId">; replaceOptionId: string } | null>(null);

  const storeCartItems = useCartStore(s => s.items);
  const cartItems = currentCartItems ?? storeCartItems;

  const usedVoucherIds = useMemo(() => {
    const used = new Set<string>();
    cartItems.forEach(cartItem => {
      if (cartItem.cartId === editingItem?.cartId) return; // Skip current item
      if (cartItem.lineVoucher) used.add(cartItem.lineVoucher.token);
      if (cartItem.addonVouchers) {
        cartItem.addonVouchers.forEach(v => used.add(v.token));
      }
    });
    return used;
  }, [cartItems, editingItem?.cartId]);

  const applicableProductVouchers = useMemo(() => {
    return filterUsableVouchers(availableVouchers ?? [], "PRODUCT").filter(v =>
      ((v.eligible_menu_items?.length ?? 0) > 0
        ? v.eligible_menu_items!.some((target) => target.menu_item_id === item.id && target.is_available)
        : v.menu_item_id === item.id) &&
      !usedVoucherIds.has(v.qr_token),
    );
  }, [availableVouchers, item.id, usedVoucherIds]);

  const addonOptionForVoucher = useCallback((voucher: MyVoucher): string | null => {
    const assignedTarget = selectedAddonVoucherTargets[voucher.qr_token];
    if (assignedTarget && selectedOptionIds.includes(assignedTarget)) return assignedTarget;
    const activeAssignedTargets = Object.values(selectedAddonVoucherTargets)
      .filter((addonOptionId) => selectedOptionIds.includes(addonOptionId));
    return resolveAddonVoucherOptionId(
      voucher,
      selectedOptionIds,
      activeAssignedTargets,
    );
  }, [selectedAddonVoucherTargets, selectedOptionIds]);

  const applicableAddonVouchers = useMemo(() => {
    return filterUsableVouchers(availableVouchers ?? [], "ADDON").filter(v => addonOptionForVoucher(v) !== null && !usedVoucherIds.has(v.qr_token));
  }, [addonOptionForVoucher, availableVouchers, usedVoucherIds]);

  const isProductVoucherApplied = selectedProductVoucherId !== null || freeVoucherId !== undefined;
  const isVoucherApplied = isProductVoucherApplied || selectedAddonVoucherIds.length > 0;
  const voucherControlsReadOnly = !walletVerified;
  const saveBlockedByWallet = voucherControlsReadOnly && (
    Boolean(editingItem?.lineVoucher) ||
    (editingItem?.addonVouchers?.length ?? 0) > 0 ||
    selectedProductVoucherId !== null ||
    selectedAddonVoucherIds.length > 0 ||
    freeVoucherId !== undefined ||
    pendingAddonVoucher !== null
  );
  
  // ── Edit Validation ──────────────────────────────────────────────────────
  const lockQuantity = isVoucherApplied || pendingAddonVoucher !== null;
  
  // ── Derived ──────────────────────────────────────────────────────────────
  const isLatte = item.category === "latte";
  const activePowderId = isLatte ? (item.powder?.id ?? "") : selectedPowderId;
  const activePowder = useMemo(() => powders.find((p) => p.id === activePowderId), [powders, activePowderId]);
  const activePowderPricePerGram = activePowder?.price_per_gram ?? 0;

  const orderedAddonGroups = useMemo(
    () => [...addonGroups].sort((left, right) =>
      left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    [addonGroups],
  );
  const baseLiquidOptions = useMemo(
    () => getBaseLiquidOptionsForItem(item, milkTypes),
    [item, milkTypes],
  );
  const defaultMilkId = item.default_base_liquid_id ?? "";
  const selectedBaseLiquidName = baseLiquidOptions.find((option) => option.id === selectedMilkId)?.name
    ?? baseLiquidOptions[0]?.name
    ?? (isLatte ? "Sữa mặc định" : "Nền mặc định");

  const powderList = useMemo(() => {
    return !isLatte && item.allowed_powder_ids.length > 0
      ? [item.resolved_default_powder_id!, ...item.allowed_powder_ids.filter(id => id !== item.resolved_default_powder_id)]
      : [];
  }, [isLatte, item.allowed_powder_ids, item.resolved_default_powder_id]);

  // ── Pricing ──────────────────────────────────────────────────────────────
  const {
    getPriceForContext,
    currentPriceContext,
    finalUnitPrice,
    totalCost,
    effectiveFreeVoucherId,
    effectiveProductVoucherType,
  } = usePriceMap({
    item, latteItems, milkTypes, addonGroups, powders, defaultPowderGrams, selectedSize, activePowderId,
    selectedMilkId, selectedOptionIds, selectedAddonVoucherTargets,
    availableVouchers, selectedProductVoucherId, freeVoucherId, freeVoucherCoveredPriceVnd, quantity
  });

  const defaultPowderPriceCtx = getPriceForContext(selectedSize, item.resolved_default_powder_id ?? "");

  // ── Browser back button support ───────────────────────────────────────────
  const closeWithHistory = useModalHistory(onClose);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleOptionToggle = useCallback((groupId: string, optionId: string) => {
    const group = addonGroups.find(g => g.id === groupId);
    if (!group) return;
    const groupOptionIds = group.options.map(o => o.id);
    setSelectedOptionIds(prev => {
      if (prev.includes(optionId)) {
        return prev.filter(id => id !== optionId);
      }
      const currentInGroup = prev.filter(id => groupOptionIds.includes(id));
      if (currentInGroup.length >= group.max_select) {
        if (group.max_select === 1) {
          return [...prev.filter(id => !groupOptionIds.includes(id)), optionId];
        }
        return prev; // Block: at max
      }
      return [...prev, optionId];
    });
  }, [addonGroups]);



  // Pull-to-dismiss logic is handled by DismissableSheet.
  // Body scroll lock is handled by DismissableSheet.


  const handleClose = useCallback(() => {
    setIsOpen(false);
    closeWithHistory();
  }, [closeWithHistory]);

  const handleAddToCart = useCallback(() => {
    if (saveBlockedByWallet) {
      void import("sonner").then(({ toast }) => toast.error(walletReadOnlyReason));
      return;
    }
    const finalAddonVouchers = Object.entries(selectedAddonVoucherTargets).map(([token, addonOptionId]) => {
        const voucher = availableVouchers?.find(candidate => candidate.qr_token === token);
        return voucher && selectedOptionIds.includes(addonOptionId) ? { addonOptionId, token } : null;
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));

    const cartItemData: Omit<CartItem, "cartId"> = {
      menuItemId: item.id,
      quantity,
      configuration: {
        size: selectedSize, sweetness, iceOption, coldwhisk, note,
        ...(!isLatte && selectedPowderId ? { powderId: selectedPowderId } : {}),
        ...(selectedMilkId ? { baseLiquidId: selectedMilkId } : {}),
        addonOptionIds: selectedOptionIds,
      },
      addonVouchers: finalAddonVouchers,
      ...(effectiveFreeVoucherId ? {
        lineVoucher: {
          token: effectiveFreeVoucherId,
          kind: effectiveProductVoucherType === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT",
        },
      } : {}),
    };

    if (onConfirm) {
      // Staff mode
      const cartItem = {
        ...cartItemData,
        cartId: editingItem?.cartId || crypto.randomUUID(),
      };
      const resolvedAddons = selectedOptionIds.flatMap((optionId) => {
        const group = addonGroups.find((candidate) => candidate.options.some((option) => option.id === optionId));
        const option = group?.options.find((candidate) => candidate.id === optionId);
        if (!group || !option) return [];
        return [{
          id: optionId,
          label: option.label,
          priceVnd: currentPriceContext.addonPricesMap[optionId] ?? 0,
          groupId: group.id,
          groupName: group.name,
          maxSelect: group.max_select,
          isExtraMatcha: option.gram_value !== null || group.is_dynamic_gram,
        }];
      });
      const grossUnitPriceVnd = currentPriceContext.unitPrice;
      const personalVoucherDiscountVnd = Math.max(0, grossUnitPriceVnd - finalUnitPrice);
      const result = onConfirm(cartItem, {
        ...cartItem,
        name: item.name,
        imageUrl: item.image_url,
        category: item.category,
        menuItem: item,
        resolvedAddons,
        drinkPriceVnd: Math.max(0, grossUnitPriceVnd - currentPriceContext.addonsCost),
        addonsPriceVnd: currentPriceContext.addonsCost,
        grossUnitPriceVnd,
        personalVoucherDiscountVnd,
        bundleDiscountVnd: 0,
        payableUnitVnd: finalUnitPrice,
        lineTotalVnd: finalUnitPrice * quantity,
        errors: [],
        revalidating: false,
      });
      if (result && !result.ok) {
        void import("sonner").then(({ toast }) => toast.error(result.message));
        return;
      }
    } else if (editingItem) {
      // Customer Edit mode
      const result = updateItem(editingItem.cartId, cartItemData);
      if (!result.ok) { void import("sonner").then(({ toast }) => toast.error(result.message)); return; }
    } else if (pendingAddonVoucher && item.category !== "extras") {
      const pendingVoucher = availableVouchers?.find((voucher) => voucher.qr_token === pendingAddonVoucher.voucherId);
      const targetValid = pendingVoucher
        ? resolveAddonVoucherOptionId(pendingVoucher, [pendingAddonVoucher.addonOptionId]) !== null
        : false;
      if (!pendingVoucher || !isVoucherUsable(pendingVoucher) || !targetValid) {
        setPendingAddonVoucher(null);
        const result = addItem(cartItemData, { consumePendingAddon: false });
        if (!result.ok) {
          void import("sonner").then(({ toast }) => toast.error(result.message));
          return;
        }
        void import("sonner").then(({ toast }) => toast.info("Voucher addon chờ áp dụng không còn khả dụng"));
        handleClose();
        return;
      }
      const groupOptionIds = new Set(addonGroups.find((group) => group.id === pendingAddonVoucher.addonGroupId)?.options.map((option) => option.id) ?? []);
      const selectedInGroup = cartItemData.configuration.size === null ? [] : cartItemData.configuration.addonOptionIds.filter((optionId) => groupOptionIds.has(optionId));
      if (cartItemData.configuration.size !== null && !cartItemData.configuration.addonOptionIds.includes(pendingAddonVoucher.addonOptionId) && selectedInGroup.length >= pendingAddonVoucher.maxSelect) {
        setPendingAddonConflict({ item: cartItemData, replaceOptionId: selectedInGroup[0] });
        return;
      }
      const result = addItem(cartItemData);
      if (!result.ok) { void import("sonner").then(({ toast }) => toast.error(result.message)); return; }
    } else {
      // Customer Add mode
      const result = addItem(cartItemData);
      if (!result.ok) { void import("sonner").then(({ toast }) => toast.error(result.message)); return; }
    }
    
    handleClose();
  }, [
    item, selectedAddonVoucherTargets, availableVouchers, currentPriceContext,
    selectedSize, finalUnitPrice, quantity, sweetness, iceOption, coldwhisk, note,
    selectedOptionIds, isLatte, selectedPowderId, selectedMilkId, effectiveFreeVoucherId,
    effectiveProductVoucherType, onConfirm, editingItem, updateItem, addItem, handleClose,
    addonGroups, pendingAddonVoucher, setPendingAddonVoucher,
    saveBlockedByWallet, walletReadOnlyReason,
  ]);

  const finishPendingAddonConflict = useCallback((replace: boolean) => {
    if (!pendingAddonConflict) return;
    const source = pendingAddonConflict.item;
    const replacement = replace && source.configuration.size !== null && pendingAddonVoucher
      ? {
          ...source,
          configuration: {
            ...source.configuration,
            addonOptionIds: source.configuration.addonOptionIds
              .filter((id) => id !== pendingAddonConflict.replaceOptionId && id !== pendingAddonVoucher.addonOptionId)
              .concat(pendingAddonVoucher.addonOptionId),
          },
        }
      : source;
    const result = addItem(replacement, { consumePendingAddon: replace });
    if (!result.ok) { void import("sonner").then(({ toast }) => toast.error(result.message)); return; }
    setPendingAddonConflict(null);
    handleClose();
  }, [addItem, handleClose, pendingAddonConflict, pendingAddonVoucher]);

  const sweetnessIdx = useMemo(() => SWEETNESS_OPTIONS.findIndex((o) => o.value === sweetness), [sweetness]);

  const modalContent = (
    <>
      {/* Left Column (Desktop only) */}
        <div className="hidden md:flex flex-col bg-[#d9e4d4]/30 border-r border-border/40 p-8 justify-between relative h-full">
          {item.image_url ? (
            <div className="relative w-full aspect-square rounded-3xl overflow-hidden shadow-md bg-white flex items-center justify-center mb-6">
              <Image
                src={item.image_url}
                alt={item.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                quality={85}
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
              />
            </div>
          ) : (
            <div className="w-full aspect-square rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
              <span className="text-8xl">🍵</span>
            </div>
          )}
          <div className="space-y-3 mt-auto">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary/60 bg-primary/5 px-2.5 py-1 rounded-full w-fit border border-primary/10">
              {item.category === "latte" ? "🍵 Latte Premium" : "✨ Fusion Special"}
            </span>
            <h2 className="font-serif text-3xl font-bold text-primary leading-tight">{item.name}</h2>
            {item.description && <p className="text-sm text-primary/60 leading-relaxed font-medium">{item.description}</p>}
            <div className="pt-2">
              <div className="flex items-baseline gap-2">
                {currentPriceContext.unitPrice > finalUnitPrice && (
                  <span className="text-sm font-semibold text-primary/40 line-through">
                    {formatKa(currentPriceContext.unitPrice, "ceil")}
                  </span>
                )}
                <span className="font-serif text-[2rem] font-bold leading-none text-primary">
                  {formatKa(finalUnitPrice, "ceil")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (customization options + scrolled container) */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-5 right-5 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-primary/8 transition-transform hover:rotate-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
          aria-label="Đóng"
        >
          <X className="w-5 h-5 text-primary" />
        </button>

        {/* overflow-x-clip overscroll-x-none prevents diagonal wiggle */}
        <div className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto overflow-x-clip overscroll-contain overscroll-x-none px-4 md:px-8 pt-7 pb-44 md:pb-40 md:pt-0">
          {item.image_url ? (
            <div className="md:hidden -mx-4 -mt-7 shrink-0 bg-[#fdfcf7]">
              <div className="relative h-[40dvh] w-full overflow-hidden bg-[#fdfcf7]">
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  sizes="100vw"
                  className="object-contain object-center"
                  quality={80}
                  placeholder="blur"
                  blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                />
                {/* Floating back button — top left over image */}
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Quay lại"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
              </div>
            </div>
          ) : (
            /* No image — back button floats top-left as standalone */
            <div className="md:hidden -mx-4 -mt-7 shrink-0 relative h-16">
              <button
                type="button"
                onClick={handleClose}
                className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Quay lại"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          )}
          <div
            className={cn("pb-3 border-b border-border/40 md:hidden", item.image_url ? "pt-3" : "pt-5")}
          >
            <h2 className="font-serif text-2xl font-bold text-primary">{item.name}</h2>
            {item.description && <p className="text-sm text-primary/55 mt-1.5 leading-relaxed">{item.description}</p>}
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                {currentPriceContext.unitPrice > finalUnitPrice && (
                  <span className="text-sm font-semibold text-primary/40 line-through">
                    {formatKa(currentPriceContext.unitPrice, "ceil")}
                  </span>
                )}
                <span className="font-serif text-[1.75rem] font-bold leading-none text-primary">
                  {formatKa(finalUnitPrice, "ceil")}
                </span>
              </div>
            </div>
          </div>

          {/* 1. SIZE */}
          {item.sizes.length > 0 && (
            <div className="mt-5">
              <SectionLabel text="Chọn size *" />
              <SizeSelector
                sizes={allowedSizes ? item.sizes.filter(s => allowedSizes.includes(s.size)) : item.sizes}
                selectedSize={selectedSize}
                onChange={setSelectedSize}
                getPriceForContext={getPriceForContext}
                activePowderId={activePowderId}
              />
            </div>
          )}

          {/* 2. SWEETNESS SLIDER */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-5">
              <SectionLabel text="Độ ngọt" />
              <span className="rounded-full bg-primary/8 px-2.5 py-1 text-sm font-bold text-primary -mt-3">
                {SWEETNESS_OPTIONS[sweetnessIdx]?.label}
              </span>
            </div>
            <div className="relative mx-3 mt-4">
              <div className="h-1.5 bg-primary/15 rounded-full w-full">
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-200 h-1.5"
                  style={{ width: `${(sweetnessIdx / (SWEETNESS_OPTIONS.length - 1)) * 100}%` }}
                />
              </div>
              <div className="absolute inset-x-0 top-0 h-1.5">
                {SWEETNESS_OPTIONS.map((opt, i) => {
                  const pct = (i / (SWEETNESS_OPTIONS.length - 1)) * 100;
                  const isActive = i === sweetnessIdx;
                  const isFilled = i <= sweetnessIdx;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSweetness(opt.value)}
                      style={{ left: `${pct}%` }}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center focus:outline-none"
                    >
                      <span className={cn(
                        "block rounded-full transition-all duration-200 border-2",
                        isActive ? "w-4 h-4 bg-primary border-primary shadow-md" :
                          isFilled ? "w-2.5 h-2.5 bg-primary border-primary" : "w-2.5 h-2.5 bg-white border-primary/30"
                      )} />
                    </button>
                  );
                })}
              </div>
              <div className="relative mt-8 h-5">
                {SWEETNESS_OPTIONS.map((opt, i) => (
                  <span
                    key={opt.value}
                    style={{ left: `${(i / (SWEETNESS_OPTIONS.length - 1)) * 100}%` }}
                    className={cn(
                      "absolute -translate-x-1/2 text-sm whitespace-nowrap font-medium transition-colors",
                      sweetness === opt.value ? "text-primary font-bold" : "text-primary/40"
                    )}
                  >
                    {opt.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 3a. Base Liquid + compact Coldwhisk */}
          <div className="mt-5">
            <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-primary/55">
                {baseLiquidOptions.length > 1 ? (isLatte ? "Loại sữa" : "Loại nền") : selectedBaseLiquidName}
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={coldwhisk}
                aria-label="Coldwhisk"
                onClick={() => setColdwhisk((value) => !value)}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="text-xs font-bold text-primary/70">Coldwhisk</span>
                <span className={cn("relative inline-flex h-6 w-10 items-center rounded-full transition-colors", coldwhisk ? "bg-primary" : "bg-primary/20")}>
                  <span className={cn("h-4 w-4 rounded-full bg-white shadow-sm transition-transform", coldwhisk ? "translate-x-5" : "translate-x-1")} />
                </span>
              </button>
            </div>
            {baseLiquidOptions.length > 1 && (
              <MilkSelector
                milkTypes={baseLiquidOptions}
                selectedMilkId={selectedMilkId}
                defaultMilkId={defaultMilkId}
                onChange={setSelectedMilkId}
                getPriceForContext={getPriceForContext}
                selectedSize={selectedSize}
                activePowderId={activePowderId}
              />
            )}
          </div>

          {/* 3b. FUSION: Powder */}
          {powderList.length > 0 && (
            <div className="mt-5">
              <SectionLabel text="Loại bột matcha" />
              <PowderSelector
                powderList={powderList}
                powders={powders}
                selectedPowderId={selectedPowderId}
                defaultPowderId={item.resolved_default_powder_id ?? null}
                onChange={setSelectedPowderId}
                getPriceForContext={getPriceForContext}
                defaultPowderPriceCtx={defaultPowderPriceCtx}
                selectedSize={selectedSize}
              />
            </div>
          )}

          {/* 5. ĐÁ */}
          <div className="mt-5">
            <SectionLabel text="Lượng đá" />
            <div className="grid grid-cols-3 gap-2">
              {ICE_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.value}
                  label={opt.label}
                  isActive={iceOption === opt.value}
                  onClick={() => setIceOption(iceOption === opt.value ? "NORMAL" : opt.value)}
                />
              ))}
            </div>
          </div>

          {/* 6. ADD-ON GROUPS IN ADMIN-DEFINED ORDER */}
          {orderedAddonGroups.map((group) => {
            const selectedCount = selectedOptionIds.filter(id => group.options.some(o => o.id === id)).length;
            const isAtMax = selectedCount >= group.max_select;

            return (
              <div key={group.id} className="mt-5">
                <SectionLabel text={group.name} />
                <div className={group.is_dynamic_gram ? "grid grid-cols-4 gap-2" : "grid grid-cols-3 gap-2"}>
                  {group.options.map((opt) => {
                    const price = group.is_dynamic_gram
                      ? ceilTo1000(opt.gram_value != null ? opt.gram_value * activePowderPricePerGram : opt.price_vnd)
                      : opt.price_vnd;
                    const isActive = selectedOptionIds.includes(opt.id);
                    const isDisabled = !isActive && isAtMax && group.max_select > 1;
                    return (
                      <div key={opt.id} className={isDisabled ? "opacity-50 grayscale pointer-events-none" : ""}>
                        <OptionCard
                          label={opt.label}
                          imageUrl={resolveAddonOptionImage(opt.image_url)}
                          imageAlt={`Ảnh ${opt.label}`}
                          sub={price > 0 ? `+${formatKa(price, "ceil")}` : group.is_dynamic_gram ? "0 k" : undefined}
                          isActive={isActive}
                          onClick={() => {
                            if (!isDisabled) {
                              handleOptionToggle(group.id, opt.id);
                            }
                          }}
                          layout="stacked"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 8. GHI CHÚ */}
          <div className="mt-7">
            <SectionLabel text="Ghi chú" />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => window.scrollTo(0, 0)}
              placeholder="Dặn dò thêm cho quán..."
              className="w-full rounded-2xl border-2 border-border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[72px] resize-none"
            />
          </div>

          {/* 9. ƯU ĐÃI CỦA BẠN */}
          {voucherControlsReadOnly && (
            <div role="alert" className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
              {walletReadOnlyReason} Voucher cá nhân đang ở chế độ chỉ xem.
            </div>
          )}
          {!disableVoucherApplication && (applicableProductVouchers.length > 0 || applicableAddonVouchers.length > 0) && (
            <div className="mt-7">
              <SectionLabel text="🎟 Ưu đãi có thể áp dụng" />
              <div className="space-y-2">
                {applicableProductVouchers.map(v => {
                  const isSelected = selectedProductVoucherId === v.qr_token;
                  return (
                    <button
                      type="button"
                      disabled={voucherControlsReadOnly}
                      key={v.qr_token}
                      onClick={() => {
                        if (!isSelected) setQuantity(1);
                        setSelectedProductVoucherId(isSelected ? null : v.qr_token);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors",
                        isSelected ? "bg-orange-50 border-orange-200" : "bg-card border-border hover:bg-orange-50/30",
                        voucherControlsReadOnly && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <div>
                        <p className="font-bold text-sm flex items-center gap-2 text-primary">
                          <Ticket size={14} className="text-orange-500" /> {v.package.name}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-orange-500 shrink-0 ml-2" />}
                    </button>
                  );
                })}
                {applicableAddonVouchers.map(v => {
                  const isSelected = selectedAddonVoucherIds.includes(v.qr_token);
                  const choices = getAddonVoucherTargetChoices(
                    v,
                    selectedOptionIds,
                    Object.values(selectedAddonVoucherTargets).filter((targetId) =>
                      selectedOptionIds.includes(targetId) && selectedAddonVoucherTargets[v.qr_token] !== targetId,
                    ),
                    currentPriceContext.addonPricesMap,
                  );
                  return (
                    <div key={v.qr_token} className="space-y-2">
                    <button
                      type="button"
                      disabled={voucherControlsReadOnly}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedAddonVoucherTargets(prev => {
                            const next = { ...prev };
                            delete next[v.qr_token];
                            return next;
                          });
                          setAddonChoiceVoucherId(null);
                        } else if (choices.length === 1) {
                          setQuantity(1);
                          setSelectedAddonVoucherTargets(prev => ({ ...prev, [v.qr_token]: choices[0].addonOptionId }));
                          setAddonChoiceVoucherId(null);
                        } else {
                          setAddonChoiceVoucherId(v.qr_token);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors",
                        isSelected ? "bg-green-50 border-green-200" : "bg-card border-border hover:bg-green-50/30",
                        voucherControlsReadOnly && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <div>
                        <p className="font-bold text-sm flex items-center gap-2 text-primary">
                          <Ticket size={14} className="text-green-600" /> {v.package?.name || `Free ${v.addonOption?.label || "Topping"}`}
                        </p>
                        {!isSelected && choices.length > 1 ? <p className="mt-1 text-xs text-green-700">Chọn topping được giảm</p> : null}
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-green-600 shrink-0 ml-2" />}
                    </button>
                    {!isSelected && addonChoiceVoucherId === v.qr_token ? (
                      <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/60 p-2" role="group" aria-label="Chọn topping được giảm">
                        {choices.map((choice) => (
                          <button
                            type="button"
                            disabled={voucherControlsReadOnly}
                            key={choice.addonOptionId}
                            onClick={() => {
                              setQuantity(1);
                              setSelectedAddonVoucherTargets((previous) => ({ ...previous, [v.qr_token]: choice.addonOptionId }));
                              setAddonChoiceVoucherId(null);
                            }}
                            className={cn("flex min-h-11 w-full items-center justify-between rounded-lg bg-white px-3 text-left text-sm font-semibold", voucherControlsReadOnly && "cursor-not-allowed opacity-60")}
                          >
                            <span>{choice.label}</span>
                            <span className="text-green-700">Giảm {choice.discountVnd.toLocaleString("vi-VN")}đ</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM CTA */}
        <ModalBottomCTA
          totalCost={totalCost}
          quantity={quantity}
          setQuantity={setQuantity}
          hideQuantityPicker={lockQuantity}
          handleAddToCart={handleAddToCart}
          isEditing={!!editingItem}
          ctaLabel={ctaLabel}
          disabled={saveBlockedByWallet}
          disabledReason={saveBlockedByWallet ? walletReadOnlyReason : undefined}
        />
    </>
  );

  return (
    <Profiler id="ProductModal" onRender={onRenderCallback}>
      <ConfirmModal isOpen={pendingAddonConflict !== null} title="Nhóm addon đã đủ" message="Thay addon đang chọn bằng addon của voucher? Nếu giữ nguyên, món vẫn được thêm và voucher sẽ chờ món mới tiếp theo." confirmLabel="Thay addon" cancelLabel="Giữ nguyên" onConfirm={() => finishPendingAddonConflict(true)} onCancel={() => finishPendingAddonConflict(false)} />
      {isDesktop ? (
        <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
            <Dialog.Content 
              className="fixed z-[101] outline-none bg-[#fdfcf7] shadow-2xl overflow-hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl h-[80vh] max-h-[85vh] rounded-[2.5rem] grid grid-cols-2 pb-0"
            >
              <Dialog.Title className="sr-only">{item.name}</Dialog.Title>
              <Dialog.Description className="sr-only">Tùy chỉnh món và thêm vào giỏ hàng</Dialog.Description>
              {modalContent}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <Drawer.Root open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }} nested={nested} repositionInputs={false}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
            <Drawer.Content 
              className="fixed bottom-0 left-0 right-0 z-[101] outline-none bg-[#fdfcf7] shadow-2xl flex flex-col h-[100dvh] max-h-[100dvh] rounded-none after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit"
            >
              <Drawer.Title className="sr-only">{item.name}</Drawer.Title>
              <Drawer.Description className="sr-only">Tùy chỉnh món và thêm vào giỏ hàng</Drawer.Description>
              <div className="absolute top-0 left-0 right-0 h-10 z-10 flex items-start justify-center pt-3 bg-transparent">
                <div className="w-12 h-1.5 bg-border rounded-full" />
              </div>
              {modalContent}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </Profiler>
  );
};

/** Minimal note/quantity editor for fixed-price Add-on menu items. */
const ExtrasModal: React.FC<ProductModalProps> = ({
  item,
  onClose,
  editingItem,
  onConfirm,
  freeVoucherId,
  availableVouchers,
  currentCartItems,
  nested = false,
  ctaLabel,
  walletVerified = true,
  walletReadOnlyReason = "Ví voucher đang được xác minh. Vui lòng thử lại sau một chút.",
}) => {
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const storedCartItems = useCartStore((state) => state.items);
  const [isOpen, setIsOpen] = useState(true);
  const [quantity, setQuantity] = useState(editingItem?.quantity ?? 1);
  const [note, setNote] = useState(editingItem?.configuration.note ?? "");
  const [voucherId, setVoucherId] = useState<string | null>(
    editingItem?.lineVoucher?.kind === "ITEM" ? editingItem.lineVoucher.token : freeVoucherId ?? null,
  );
  const unitPrice = item.unit_price_vnd ?? 0;
  const usedVoucherIds = new Set(
    (currentCartItems ?? storedCartItems)
      .filter((cartItem) => cartItem.cartId !== editingItem?.cartId)
      .flatMap((cartItem) => cartItem.lineVoucher ? [cartItem.lineVoucher.token] : [])
      .filter((voucherId): voucherId is string => Boolean(voucherId)),
  );
  const itemVouchers = filterUsableVouchers(availableVouchers ?? [], "ITEM").filter(
    (voucher) => (
      (voucher.eligible_menu_items?.length ?? 0) > 0
        ? voucher.eligible_menu_items!.some((target) => target.menu_item_id === item.id && target.is_available)
        : voucher.menu_item_id === item.id
    ) && !usedVoucherIds.has(voucher.qr_token),
  );
  const hasVoucher = voucherId !== null;
  const finalPrice = hasVoucher ? 0 : unitPrice;
  const effectiveQuantity = hasVoucher ? 1 : quantity;
  const totalPrice = finalPrice * effectiveQuantity;
  const voucherControlsReadOnly = !walletVerified;
  const saveBlockedByWallet = voucherControlsReadOnly && (
    Boolean(editingItem?.lineVoucher) || voucherId !== null || freeVoucherId !== undefined
  );
  const ctaText = ctaLabel ?? (editingItem ? "Cập nhật" : "Bỏ vào giỏ cá");
  const isDesktop = useSyncExternalStore(subscribeToDesktopViewport, getDesktopSnapshot, getDesktopServerSnapshot);
  const closeWithHistory = useModalHistory(onClose);

  const close = () => {
    setIsOpen(false);
    closeWithHistory();
  };

  const save = () => {
    if (saveBlockedByWallet) {
      void import("sonner").then(({ toast }) => toast.error(walletReadOnlyReason));
      return;
    }
    const cartItemData: Omit<CartItem, "cartId"> = {
      menuItemId: item.id,
      quantity: hasVoucher ? 1 : quantity,
      configuration: { size: null, note },
      addonVouchers: [],
      ...(voucherId ? { lineVoucher: { token: voucherId, kind: "ITEM" as const } } : {}),
    };
    const cartItem: CartItem = {
      ...cartItemData,
      cartId: editingItem?.cartId ?? crypto.randomUUID(),
    };
    const result = onConfirm
      ? onConfirm(cartItem, {
          ...cartItem,
          name: item.name,
          imageUrl: item.image_url,
          category: "extras",
          menuItem: item,
          resolvedAddons: [],
          drinkPriceVnd: unitPrice,
          addonsPriceVnd: 0,
          grossUnitPriceVnd: unitPrice,
          personalVoucherDiscountVnd: hasVoucher ? unitPrice : 0,
          bundleDiscountVnd: 0,
          payableUnitVnd: finalPrice,
          lineTotalVnd: totalPrice,
          errors: [],
          revalidating: false,
        })
      : editingItem
        ? updateItem(editingItem.cartId, cartItemData)
        : addItem(cartItemData);
    if (result && !result.ok) { void import("sonner").then(({ toast }) => toast.error(result.message)); return; }
    close();
  };

  const formContent = (
    <>
      <div className="pr-10">
        <h2 className="font-serif text-2xl font-bold text-primary">{item.name}</h2>
        {item.description && <p className="mt-1 text-sm text-primary/60">{item.description}</p>}
        <p className="mt-3 font-serif text-2xl font-bold text-primary">{formatKa(finalPrice, "ceil")}</p>
      </div>
      <label className="mt-6 block text-sm font-bold text-primary" htmlFor="extras-note">Ghi chú</label>
      <textarea id="extras-note" value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Ví dụ: đóng gói riêng" className="mt-2 w-full resize-none rounded-2xl border-2 border-border bg-white p-3 text-sm outline-none focus:border-primary" />
      {voucherControlsReadOnly && (
        <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
          {walletReadOnlyReason} Voucher cá nhân đang ở chế độ chỉ xem.
        </div>
      )}
      {itemVouchers.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-bold text-primary">Voucher Add-on</p>
          <button type="button" disabled={voucherControlsReadOnly} onClick={() => setVoucherId((current) => current ? null : itemVouchers[0]?.qr_token ?? null)} className={cn("mt-2 flex min-h-12 w-full items-center justify-between rounded-2xl border-2 px-4 text-left", hasVoucher ? "border-green-500 bg-green-50" : "border-border bg-white", voucherControlsReadOnly && "cursor-not-allowed opacity-60") }>
            <span className="text-sm font-medium">{hasVoucher ? "Miễn phí 1 Add-on" : "Áp dụng voucher"}</span>
            {hasVoucher && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          </button>
        </div>
      )}
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-primary/5 p-3">
        <span className="text-sm font-bold text-primary">Số lượng</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Giảm số lượng" disabled={hasVoucher} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white disabled:opacity-40"><Minus className="h-4 w-4" /></button>
          <span className="w-5 text-center font-bold text-primary">{effectiveQuantity}</span>
          <button type="button" aria-label="Tăng số lượng" disabled={hasVoucher} onClick={() => setQuantity((value) => Math.min(10, value + 1))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      </div>
      <button type="button" onClick={save} disabled={saveBlockedByWallet} title={saveBlockedByWallet ? walletReadOnlyReason : undefined} className="sticky bottom-0 mt-5 min-h-12 w-full rounded-2xl bg-primary px-4 font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 md:static">{ctaText} - {formatKa(totalPrice, "ceil")}</button>
    </>
  );

  if (!isDesktop) return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && close()} nested={nested} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[101] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#fdfcf7] outline-none after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit">
          <Drawer.Title className="sr-only">{item.name}</Drawer.Title>
          <Drawer.Description className="sr-only">Chi tiết sản phẩm và số lượng</Drawer.Description>
          <div className="absolute inset-x-0 top-0 z-20 flex h-10 items-start justify-center pt-3"><div className="h-1.5 w-12 rounded-full bg-border" /></div>
          <div className="flex-1 overflow-y-auto overflow-x-clip overscroll-contain overscroll-x-none pb-[max(2rem,env(safe-area-inset-bottom))]">
            <div className={cn("relative", item.image_url ? "aspect-square" : "h-16")}>
              {item.image_url && <Image src={item.image_url} alt={item.name} fill sizes="100vw" className="object-cover" />}
              <button type="button" onClick={close} aria-label="Quay lại" className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm"><ArrowLeft className="h-5 w-5" /></button>
            </div>
            <div className="p-5">{formContent}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 bottom-4 z-[101] mx-auto max-w-lg rounded-[2rem] bg-[#fdfcf7] p-6 shadow-2xl outline-none md:inset-x-auto md:bottom-auto md:top-1/2 md:-translate-y-1/2">
          <Dialog.Title className="sr-only">{item.name}</Dialog.Title>
          <Dialog.Description className="sr-only">Chi tiết sản phẩm và số lượng</Dialog.Description>
          <button type="button" onClick={close} aria-label="Đóng" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-primary/60 hover:bg-primary/10">
            <X className="h-5 w-5" />
          </button>
          {formContent}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const LatteModal: React.FC<ProductModalProps> = (props) => <BaseModal {...props} />;
const FusionModal: React.FC<ProductModalProps> = (props) => <BaseModal {...props} />;

export default function ProductModal(props: ProductModalProps) {
  if (props.item.category === "latte") return <LatteModal {...props} />;
  if (props.item.category === "fusion") return <FusionModal {...props} />;
  return <ExtrasModal {...props} />;
}
