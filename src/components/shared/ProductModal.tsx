"use client";

import React, { useState, useCallback, useMemo, Profiler, useSyncExternalStore } from "react";
import Image from "next/image";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { Drawer } from "vaul";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Minus, Plus, Ticket, CheckCircle2, ArrowLeft } from "lucide-react";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { filterUsableVouchers } from "@/src/utils/voucherMatchUtils";
import type { AddonGroup, MenuItem, MilkTypeOption, SweetnessLevel, Size } from "@/src/lib/types/menu";
import type { IceOption, CartItem } from "@/src/lib/types/cart";
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

interface ProductModalProps {
  item: MenuItem;
  latteItems: MenuItem[];
  milkTypes: MilkTypeOption[];
  addonGroups: AddonGroup[];
  onClose: () => void;
  // ── Edit mode ──
  editingItem?: CartItem;
  // ── Staff mode ──
  onConfirm?: (item: CartItem) => void;
  freeVoucherId?: string;
  freeVoucherCoveredPriceVnd?: number;
  availableVouchers?: MyVoucher[];
  // ── Drawer UI ──
  nested?: boolean;
  currentCartItems?: CartItem[];
  // ── Bundle Selection ──
  allowedSizes?: Size[];
  disableVoucherApplication?: boolean;
  /** Optional CTA button label override (e.g. "Chọn món này" in bundle context). */
  ctaLabel?: string;
}

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const subscribeToDesktopViewport = (onChange: () => void) => {
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getDesktopSnapshot = () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
const getDesktopServerSnapshot = () => false;

// Extracted OptionCard, SizeSelector, MilkSelector, PowderSelector are imported

const BaseModal: React.FC<ProductModalProps> = ({ 
  item, latteItems, milkTypes, addonGroups, onClose, editingItem, onConfirm, freeVoucherId,
  freeVoucherCoveredPriceVnd, availableVouchers, nested = false, currentCartItems,
  allowedSizes, disableVoucherApplication, ctaLabel
}) => {
  const [isOpen, setIsOpen] = useState(true);
  // Global state
  const addItem = useCartStore(s => s.addItem);
  const updateItem = useCartStore(s => s.updateItem);
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
    if (editingItem?.size) return editingItem.size;
    const available = item.sizes ?? [];
    const displaySizes = allowedSizes ? available.filter(s => allowedSizes.includes(s.size)) : available;
    return (displaySizes.find((s) => s.size === "MEDIUM") ?? displaySizes[0])?.size ?? "SMALL";
  });
  const [sweetness, setSweetness] = useState<SweetnessLevel>(() => editingItem?.sweetness ?? "FULL");
  const [iceOption, setIceOption] = useState<IceOption>(() => editingItem?.iceOption ?? "NORMAL");
  const [coldwhisk, setColdwhisk] = useState(() => editingItem?.coldwhisk ?? false);
  const [selectedPowderId, setSelectedPowderId] = useState<string>(() => editingItem?.selectedPowderId ?? item.resolved_default_powder_id ?? "");
  const [selectedMilkId, setSelectedMilkId] = useState<string>(() => {
    if (editingItem?.selectedBaseLiquidId) return editingItem.selectedBaseLiquidId;
    if (editingItem?.selectedMilkTypeId) return editingItem.selectedMilkTypeId;
    return item.default_base_liquid_id ?? "";
  });
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() => {
    const validOptionIds = new Set(
      addonGroups.flatMap((group) => group.options.map((option) => option.id))
    );
    if (editingItem) {
      return editingItem.selectedOptionIds.filter((id) => validOptionIds.has(id));
    }
    return [];
  });
  const [quantityMap, setQuantityMap] = useState<Record<string, number>>(() => {
    if (editingItem) return editingItem.quantityMap;
    return Object.fromEntries(addonGroups.filter((group) => group.type === "QUANTITY").map((group) => [group.id, 0]));
  });
  const [quantity, setQuantity] = useState(() => {
    const startsWithVoucher =
      editingItem?.productVoucherId !== undefined ||
      (editingItem?.addonVouchers?.length ?? 0) > 0 ||
      freeVoucherId !== undefined;
    return startsWithVoucher ? 1 : editingItem?.quantity ?? 1;
  });
  const [note, setNote] = useState(() => editingItem?.note ?? "");

  const [selectedProductVoucherId, setSelectedProductVoucherId] = useState<string | null>(() => editingItem?.productVoucherId ?? null);
  const [selectedAddonVoucherIds, setSelectedAddonVoucherIds] = useState<string[]>(() => editingItem?.addonVouchers?.map(v => v.voucherId) ?? []);

  const storeCartItems = useCartStore(s => s.items);
  const cartItems = currentCartItems ?? storeCartItems;

  const usedVoucherIds = useMemo(() => {
    const used = new Set<string>();
    cartItems.forEach(cartItem => {
      if (cartItem.cartId === editingItem?.cartId) return; // Skip current item
      if (cartItem.productVoucherId) used.add(cartItem.productVoucherId);
      if (cartItem.addonVouchers) {
        cartItem.addonVouchers.forEach(v => used.add(v.voucherId));
      }
    });
    return used;
  }, [cartItems, editingItem?.cartId]);

  const applicableProductVouchers = useMemo(() => {
    return filterUsableVouchers(availableVouchers ?? [], "PRODUCT").filter(v => v.menu_item_id === item.id && !usedVoucherIds.has(v.qr_token));
  }, [availableVouchers, item.id, usedVoucherIds]);

  const applicableAddonVouchers = useMemo(() => {
    const currentAddonIds = new Set([
      ...selectedOptionIds,
      ...addonGroups.filter(group => group.type === "QUANTITY" && (quantityMap[group.id] ?? 0) > 0).map(group => group.options[0]?.id).filter(Boolean)
    ]);
    return filterUsableVouchers(availableVouchers ?? [], "ADDON").filter(v => v.addon_option_id !== null && currentAddonIds.has(v.addon_option_id) && !usedVoucherIds.has(v.qr_token));
  }, [availableVouchers, selectedOptionIds, quantityMap, addonGroups, usedVoucherIds]);

  const isProductVoucherApplied = selectedProductVoucherId !== null || freeVoucherId !== undefined;
  const isVoucherApplied = !disableVoucherApplication && (isProductVoucherApplied || selectedAddonVoucherIds.length > 0);
  
  // ── Edit Validation ──────────────────────────────────────────────────────
  const lockQuantity = isVoucherApplied;
  
  // ── Derived ──────────────────────────────────────────────────────────────
  const isLatte = item.category === "latte";
  const activePowderId = isLatte ? (item.powder?.id ?? "") : selectedPowderId;
  const activePowder = useMemo(() => powders.find((p) => p.id === activePowderId), [powders, activePowderId]);
  const activePowderPricePerGram = activePowder?.price_per_gram ?? 0;

  const quantityGroups = useMemo(() => addonGroups.filter((group) => group.type === "QUANTITY"), [addonGroups]);
  const selectorGroups = useMemo(() => addonGroups.filter((group) => group.type === "SELECTOR"), [addonGroups]);
  const toggleGroups = useMemo(() => addonGroups.filter((group) => group.type === "TOGGLE"), [addonGroups]);

  const matchaSelectorGroups = useMemo(
    () => selectorGroups.filter((group) => group.options.every((option) => option.gram_value != null)),
    [selectorGroups],
  );
  const otherSelectorGroups = useMemo(
    () => selectorGroups.filter((group) => group.options.some((option) => option.gram_value == null)),
    [selectorGroups],
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
    effectiveFreeCoveredPrice,
    effectiveProductVoucherType,
  } = usePriceMap({
    item, latteItems, milkTypes, addonGroups, powders, defaultPowderGrams, selectedSize, activePowderId,
    selectedMilkId, quantityMap, selectedOptionIds, selectedAddonVoucherIds,
    availableVouchers, selectedProductVoucherId, freeVoucherId, freeVoucherCoveredPriceVnd, quantity
  });

  const defaultPowderPriceCtx = getPriceForContext(selectedSize, item.resolved_default_powder_id ?? "");

  // ── Browser back button support ───────────────────────────────────────────
  const closeWithHistory = useModalHistory(onClose);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectorToggle = useCallback((groupId: string, optionId: string) => {
    const group = addonGroups.find(candidate => candidate.id === groupId);
    if (!group) return;
    const groupOptionIds = group.options.map((o) => o.id);
    setSelectedOptionIds((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      return [...prev.filter((id) => !groupOptionIds.includes(id)), optionId];
    });
  }, [addonGroups]);

  const handleToggleChange = useCallback((optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  }, []);



  // Pull-to-dismiss logic is handled by DismissableSheet.
  // Body scroll lock is handled by DismissableSheet.


  const handleClose = useCallback(() => {
    setIsOpen(false);
    closeWithHistory();
  }, [closeWithHistory]);

  const handleAddToCart = useCallback(() => {
    const quantityAddonOptions = addonGroups
      .filter((g) => g.type === "QUANTITY")
      .flatMap((g) => {
        const qty = quantityMap[g.id] ?? 0;
        return qty > 0 && g.options[0] ? [{ option_id: g.options[0].id, quantity: qty }] : [];
      });

    const finalAddonVouchers = selectedAddonVoucherIds.map(vid => {
        const v = availableVouchers?.find(av => av.qr_token === vid);
        return v ? { 
            addonOptionId: v.addon_option_id!, 
            voucherId: vid,
            discountVnd: currentPriceContext.addonPricesMap[v.addon_option_id!] ?? 0
        } : null;
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));

    const cartItemData: Omit<CartItem, "cartId"> = {
      menuItemId: item.id, name: item.name, category: item.category, imageUrl: item.image_url,
      size: selectedSize, unitPrice: currentPriceContext.unitPrice, quantity, sweetness, iceOption, coldwhisk,
      note, selectedOptionIds, quantityMap, addonsPrice: currentPriceContext.addonsCost, addonPrices: currentPriceContext.addonPricesMap, quantityAddonOptions,
      selectedPowderId: isLatte ? undefined : selectedPowderId,
      selectedBaseLiquidId: selectedMilkId || undefined,
      selectedMilkTypeId: isLatte ? selectedMilkId : undefined,
      clientPriceVnd: finalUnitPrice,
      originalClientPriceVnd: currentPriceContext.unitPrice,
      addonVouchers: finalAddonVouchers,
      productVoucherId: effectiveFreeVoucherId || undefined,
      productVoucherDiscountVnd: effectiveFreeVoucherId ? effectiveFreeCoveredPrice : undefined,
      productVoucherType: effectiveFreeVoucherId ? effectiveProductVoucherType : undefined,
    };

    if (onConfirm) {
      // Staff mode
      onConfirm({
        ...cartItemData,
        cartId: editingItem?.cartId || crypto.randomUUID(),
      } as CartItem);
    } else if (editingItem) {
      // Customer Edit mode
      const isVoucherApplied = !disableVoucherApplication && (effectiveFreeVoucherId !== undefined || finalAddonVouchers.length > 0);
      if (editingItem.quantity > 1 && isVoucherApplied) {
        // Split item: 1 item with voucher, remainder without voucher
        updateItem(editingItem.cartId, { ...cartItemData, quantity: 1 });
        const remainderData = {
          ...cartItemData,
          quantity: editingItem.quantity - 1,
          unitPrice: currentPriceContext.unitPrice,
          clientPriceVnd: currentPriceContext.unitPrice,
          productVoucherId: undefined,
          productVoucherDiscountVnd: undefined,
          productVoucherType: undefined,
          addonVouchers: [],
        };
        addItem(remainderData);
      } else {
        updateItem(editingItem.cartId, cartItemData);
      }
    } else {
      // Customer Add mode
      addItem(cartItemData);
    }
    
    handleClose();
  }, [
    item, quantityMap, selectedAddonVoucherIds, availableVouchers, currentPriceContext,
    selectedSize, finalUnitPrice, quantity, sweetness, iceOption, coldwhisk, note,
    selectedOptionIds, isLatte, selectedPowderId, selectedMilkId, effectiveFreeVoucherId,
    effectiveFreeCoveredPrice, effectiveProductVoucherType, onConfirm, editingItem, updateItem, addItem, handleClose,
    addonGroups, disableVoucherApplication,
  ]);

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
        <div className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto overflow-x-clip overscroll-contain overscroll-x-none px-5 md:px-8 pt-7 pb-44 md:pb-40 md:pt-0">
          {item.image_url ? (
            <div className="md:hidden -mx-5 -mt-7 shrink-0">
              <div className="relative aspect-square max-h-[33dvh] w-full overflow-hidden">
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  sizes="100vw"
                  className="object-cover object-center"
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
            <div className="md:hidden -mx-5 -mt-7 shrink-0 relative h-16">
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
            className={cn("pb-5 border-b border-border/40 md:hidden", item.image_url ? "pt-4" : "pt-7")}
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
            <div className="mt-7">
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
          <div className="mt-7">
            <div className="flex items-center justify-between mb-5">
              <SectionLabel text="Độ ngọt" />
              <span className="text-sm font-bold text-primary bg-primary/8 px-2.5 py-1 rounded-full -mt-3">
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
                      "absolute -translate-x-1/2 text-xs whitespace-nowrap font-medium transition-colors",
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
          <div className="mt-7">
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
            <div className="mt-7">
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
          <div className="mt-7">
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

          {/* 6. TOPPING (Kem + Đá dừa) */}
          {(otherSelectorGroups.length > 0 || toggleGroups.length > 0) && (
            <div className="mt-7">
              <SectionLabel text="Topping" />
              <div className="grid grid-cols-3 gap-2">
                {otherSelectorGroups.map((group) =>
                  group.options.map((opt) => {
                    return (
                      <OptionCard
                        key={opt.id}
                        label={opt.label}
                        imageUrl={group.image_url}
                        imageAlt={`Ảnh ${group.name}`}
                        sub={opt.price_vnd > 0 ? `+${formatKa(opt.price_vnd, "ceil")}` : undefined}
                        isActive={selectedOptionIds.includes(opt.id)}
                        onClick={() => handleSelectorToggle(group.id, opt.id)}
                        layout="stacked"
                      />
                    );
                  })
                )}
                {toggleGroups.map((group) => {
                  const opt = group.options[0];
                  if (!opt) return null;
                  return (
                    <OptionCard
                      key={group.id}
                      label={group.name}
                      imageUrl={group.image_url}
                      imageAlt={`Ảnh ${group.name}`}
                      sub={opt.price_vnd > 0 ? `+${formatKa(opt.price_vnd, "ceil")}` : undefined}
                      isActive={selectedOptionIds.includes(opt.id)}
                      onClick={() => handleToggleChange(opt.id)}
                      layout="stacked"
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 7. EXTRA MATCHA (SELECTOR) */}
          {matchaSelectorGroups.map((group) => (
            <div key={group.id} className="mt-7">
              <SectionLabel text={group.name} />
              <div className="grid grid-cols-4 gap-2">
                {group.options.map((opt) => {
                  const price = ceilTo1000(opt.gram_value != null ? opt.gram_value * activePowderPricePerGram : opt.price_vnd);
                  return (
                    <OptionCard
                      key={opt.id}
                      label={opt.label}
                      imageUrl={group.image_url}
                      imageAlt={`Ảnh ${group.name}`}
                      sub={price > 0 ? `+${formatKa(price, "ceil")}` : "0 ká"}
                      isActive={selectedOptionIds.includes(opt.id)}
                      onClick={() => handleSelectorToggle(group.id, opt.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* 8. EXTRA MATCHA (QUANTITY - IF ANY) */}
          {quantityGroups.map((group) => {
            const qty = quantityMap[group.id] ?? 0;
            const max = group.max_quantity ?? 10;
            const opt = group.options[0];
            if (!opt) return null;
            const rawPricePerQty = opt.gram_value != null
              ? opt.gram_value * activePowderPricePerGram
              : opt.price_vnd;

            // Build the string: "1g: +Xk, 2g: +Yk, 3g: +Zk..." up to 3 items max.
            const listLimit = Math.min(3, max);
            const pricesStr = Array.from({ length: listLimit }).map((_, i) => {
              const amount = i + 1;
              const cost = ceilTo1000(amount * rawPricePerQty);
              return `${amount}g: +${formatKa(cost, "ceil")}`;
            }).join(", ") + (max > listLimit ? "..." : "");

            return (
              <div key={group.id} className="mt-7">
                <SectionLabel text={group.name} />
                <div className="flex items-center justify-between bg-white rounded-2xl border-2 border-border px-5 py-4">
                  <div>
                    <p className="text-sm font-bold text-primary">{group.name}</p>
                    <p className={cn("mt-1 text-xs", rawPricePerQty > 0 ? "font-semibold text-[#c74646]" : "font-medium text-primary/65")}>
                      {rawPricePerQty > 0 ? pricesStr : "Miễn phí"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-[#d9e4d4] rounded-xl px-3 py-2">
                    <button
                      onClick={() => setQuantityMap((p) => ({ ...p, [group.id]: Math.max(0, qty - 1) }))}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/60 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Giảm ${group.name}`}
                    >
                      <Minus className="h-4 w-4 text-primary" />
                    </button>
                    <span className="text-base font-bold w-5 text-center text-primary">{qty}</span>
                    <button
                      onClick={() => setQuantityMap((p) => ({ ...p, [group.id]: Math.min(max, qty + 1) }))}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/60 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Tăng ${group.name}`}
                    >
                      <Plus className="h-4 w-4 text-primary" />
                    </button>
                  </div>
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
          {!disableVoucherApplication && (applicableProductVouchers.length > 0 || applicableAddonVouchers.length > 0) && (
            <div className="mt-7">
              <SectionLabel text="🎟 Ưu đãi có thể áp dụng" />
              <div className="space-y-2">
                {applicableProductVouchers.map(v => {
                  const isSelected = selectedProductVoucherId === v.qr_token;
                  return (
                    <button
                      key={v.qr_token}
                      onClick={() => {
                        if (!isSelected) setQuantity(1);
                        setSelectedProductVoucherId(isSelected ? null : v.qr_token);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors",
                        isSelected ? "bg-orange-50 border-orange-200" : "bg-card border-border hover:bg-orange-50/30"
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
                  return (
                    <button
                      key={v.qr_token}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedAddonVoucherIds(prev => prev.filter(id => id !== v.qr_token));
                        } else {
                          setQuantity(1);
                          const otherIdsToRemove = applicableAddonVouchers
                            .filter(av => av.addon_option_id === v.addon_option_id && av.qr_token !== v.qr_token)
                            .map(av => av.qr_token);
                          setSelectedAddonVoucherIds(prev => [...prev.filter(id => !otherIdsToRemove.includes(id)), v.qr_token]);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors",
                        isSelected ? "bg-green-50 border-green-200" : "bg-card border-border hover:bg-green-50/30"
                      )}
                    >
                      <div>
                        <p className="font-bold text-sm flex items-center gap-2 text-primary">
                          <Ticket size={14} className="text-green-600" /> {v.package?.name || `Free ${v.addonOption?.label || "Topping"}`}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-green-600 shrink-0 ml-2" />}
                    </button>
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
        />
    </>
  );

  return (
    <Profiler id="ProductModal" onRender={onRenderCallback}>
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
}) => {
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const storedCartItems = useCartStore((state) => state.items);
  const [isOpen, setIsOpen] = useState(true);
  const [quantity, setQuantity] = useState(editingItem?.quantity ?? 1);
  const [note, setNote] = useState(editingItem?.note ?? "");
  const [voucherId, setVoucherId] = useState<string | null>(
    editingItem?.itemVoucherId ?? freeVoucherId ?? null,
  );
  const unitPrice = item.unit_price_vnd ?? 0;
  const usedVoucherIds = new Set(
    (currentCartItems ?? storedCartItems)
      .filter((cartItem) => cartItem.cartId !== editingItem?.cartId)
      .flatMap((cartItem) => [cartItem.productVoucherId, cartItem.itemVoucherId])
      .filter((voucherId): voucherId is string => Boolean(voucherId)),
  );
  const itemVouchers = filterUsableVouchers(availableVouchers ?? [], "ITEM").filter(
    (voucher) => voucher.menu_item_id === item.id && !usedVoucherIds.has(voucher.qr_token),
  );
  const hasVoucher = voucherId !== null;
  const finalPrice = hasVoucher ? 0 : unitPrice;
  const effectiveQuantity = hasVoucher ? 1 : quantity;
  const totalPrice = finalPrice * effectiveQuantity;
  const ctaText = ctaLabel ?? (editingItem ? "Cập nhật" : "Bỏ vào giỏ cá");
  const isDesktop = useSyncExternalStore(subscribeToDesktopViewport, getDesktopSnapshot, getDesktopServerSnapshot);
  const closeWithHistory = useModalHistory(onClose);

  const close = () => {
    setIsOpen(false);
    closeWithHistory();
  };

  const save = () => {
    const cartItemData: Omit<CartItem, "cartId"> = {
      menuItemId: item.id,
      name: item.name,
      category: "extras",
      imageUrl: item.image_url,
      size: null,
      unitPrice,
      quantity: hasVoucher ? 1 : quantity,
      sweetness: "FULL",
      iceOption: "NORMAL",
      coldwhisk: false,
      note,
      selectedOptionIds: [],
      quantityMap: {},
      addonsPrice: 0,
      addonPrices: {},
      quantityAddonOptions: [],
      clientPriceVnd: finalPrice,
      originalClientPriceVnd: unitPrice,
      itemVoucherId: voucherId ?? undefined,
    };
    const cartItem: CartItem = {
      ...cartItemData,
      cartId: editingItem?.cartId ?? crypto.randomUUID(),
    };
    if (onConfirm) onConfirm(cartItem);
    else if (editingItem) updateItem(editingItem.cartId, cartItemData);
    else addItem(cartItemData);
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
      {itemVouchers.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-bold text-primary">Voucher Add-on</p>
          <button type="button" onClick={() => setVoucherId((current) => current ? null : itemVouchers[0]?.qr_token ?? null)} className={cn("mt-2 flex min-h-12 w-full items-center justify-between rounded-2xl border-2 px-4 text-left", hasVoucher ? "border-green-500 bg-green-50" : "border-border bg-white") }>
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
      <button type="button" onClick={save} className="sticky bottom-0 mt-5 min-h-12 w-full rounded-2xl bg-primary px-4 font-bold text-white md:static">{ctaText} - {formatKa(totalPrice, "ceil")}</button>
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
