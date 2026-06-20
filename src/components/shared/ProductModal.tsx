"use client";

import React, { useState, useEffect, useMemo, useRef, Profiler } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { DismissableSheet } from "@/src/components/ui/DismissableSheet";
import { X, Minus, Plus, ShoppingBag, Ticket, CheckCircle2 } from "lucide-react";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { filterUsableVouchers } from "@/src/utils/voucherMatchUtils";
import type { MenuItem, SweetnessLevel, Size } from "@/src/lib/types/menu";
import type { IceOption, CartItem } from "@/src/lib/types/cart";
import { useCartStore } from "@/src/lib/store/cartStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { cn } from "@/src/utils/cn";
import { ceilTo1000 } from "@/src/utils/pricing";
import { SWEETNESS_OPTIONS, ICE_OPTIONS } from "@/src/constants/orderOptions";
import { usePriceMap } from "./product-modal/usePriceMap";
import { SizeSelector } from "./product-modal/SizeSelector";
import { MilkSelector } from "./product-modal/MilkSelector";
import { PowderSelector } from "./product-modal/PowderSelector";
import { ModalBottomCTA } from "./product-modal/ModalBottomCTA";
import { SectionLabel } from "./product-modal/SectionLabel";
import { OptionCard } from "./product-modal/OptionCard";

interface ProductModalProps {
  item: MenuItem;
  latteItems: MenuItem[];
  onClose: () => void;
  // ── Edit mode ──
  editingItem?: CartItem;
  // ── Staff mode ──
  onConfirm?: (item: CartItem) => void;
  freeVoucherId?: string;
  freeVoucherCoveredPriceVnd?: number;
  availableVouchers?: MyVoucher[];
}

// Extracted OptionCard, SizeSelector, MilkSelector, PowderSelector are imported

const BaseModal: React.FC<ProductModalProps> = ({ item, latteItems, onClose, editingItem, onConfirm, freeVoucherId, freeVoucherCoveredPriceVnd, availableVouchers }) => {
  const { addItem, updateItem } = useCartStore();
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  // ── Desktop / Responsive Detection ──
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    setIsDesktop(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedSize, setSelectedSize] = useState<Size>(() => {
    if (editingItem) return editingItem.size;
    const available = item.sizes ?? [];
    return (available.find((s) => s.size === "L") ?? available[0])?.size ?? "M";
  });
  const [sweetness, setSweetness] = useState<SweetnessLevel>(() => editingItem?.sweetness ?? "HALF");
  const [iceOption, setIceOption] = useState<IceOption>(() => editingItem?.iceOption ?? "NORMAL");
  const [coldwhisk, setColdwhisk] = useState(() => editingItem?.coldwhisk ?? false);
  const [selectedPowderId, setSelectedPowderId] = useState<string>(() => editingItem?.selectedPowderId ?? item.resolved_default_powder_id ?? "");
  const [selectedMilkId, setSelectedMilkId] = useState<string>(() => {
    if (editingItem?.selectedMilkTypeId) return editingItem.selectedMilkTypeId;
    return item.milk_types?.find(m => m.is_default)?.id ?? item.milk_types?.[0]?.id ?? "";
  });
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() => {
    if (editingItem) return editingItem.selectedOptionIds;
    return item.addon_groups.flatMap((g) => g.options.filter((o) => o.is_default).map((o) => o.id));
  });
  const [quantityMap, setQuantityMap] = useState<Record<string, number>>(() => {
    if (editingItem) return editingItem.quantityMap;
    return Object.fromEntries(item.addon_groups.filter((g) => g.type === "QUANTITY").map((g) => [g.id, 0]));
  });
  const [quantity, setQuantity] = useState(() => editingItem?.quantity ?? 1);
  const [note, setNote] = useState(() => editingItem?.note ?? "");

  const [selectedProductVoucherId, setSelectedProductVoucherId] = useState<string | null>(() => editingItem?.productVoucherId ?? null);
  const [selectedAddonVoucherIds, setSelectedAddonVoucherIds] = useState<string[]>(() => editingItem?.addonVouchers?.map(v => v.voucherId) ?? []);

  const applicableProductVouchers = useMemo(() => {
    return filterUsableVouchers(availableVouchers ?? [], "PRODUCT").filter(v => v.menu_item_id === item.id);
  }, [availableVouchers, item.id]);

  const applicableAddonVouchers = useMemo(() => {
    const currentAddonIds = new Set([
      ...selectedOptionIds,
      ...item.addon_groups.filter(g => g.type === "QUANTITY" && (quantityMap[g.id] ?? 0) > 0).map(g => g.options[0]?.id).filter(Boolean)
    ]);
    return filterUsableVouchers(availableVouchers ?? [], "ADDON").filter(v => v.addon_option_id !== null && currentAddonIds.has(v.addon_option_id));
  }, [availableVouchers, selectedOptionIds, quantityMap, item.addon_groups]);

  const isProductVoucherApplied = selectedProductVoucherId !== null || freeVoucherId !== undefined;
  
  useEffect(() => {
    if (isProductVoucherApplied && quantity !== 1) {
      setQuantity(1);
    }
  }, [isProductVoucherApplied, quantity]);

  // ── Edit Validation ──────────────────────────────────────────────────────
  const hideQuantityPicker = isProductVoucherApplied || selectedAddonVoucherIds.length > 0;
  
  useEffect(() => {
    if (!editingItem) return;
    const allValidOptionIds = new Set(
      item.addon_groups.flatMap(g => g.options.map(o => o.id))
    );
    const removedOptions = editingItem.selectedOptionIds.filter(
      id => !allValidOptionIds.has(id)
    );
    if (removedOptions.length > 0) {
      setSelectedOptionIds(prev => prev.filter(id => allValidOptionIds.has(id)));
    }
  }, [editingItem, item.addon_groups]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const isLatte = item.category === "latte";
  const activePowderId = isLatte ? (item.powder?.id ?? "") : selectedPowderId;
  const activePowder = powders.find((p) => p.id === activePowderId);
  const activePowderPricePerGram = activePowder?.price_per_gram ?? 0;

  const quantityGroups = useMemo(() => item.addon_groups.filter((g) => g.type === "QUANTITY"), [item.addon_groups]);
  const selectorGroups = useMemo(() => item.addon_groups.filter((g) => g.type === "SELECTOR"), [item.addon_groups]);
  const toggleGroups = useMemo(() => item.addon_groups.filter((g) => g.type === "TOGGLE"), [item.addon_groups]);

  const matchaSelectorGroups = useMemo(() => selectorGroups.filter(g => g.name.toLowerCase().includes("matcha")), [selectorGroups]);
  const otherSelectorGroups = useMemo(() => selectorGroups.filter(g => !g.name.toLowerCase().includes("matcha")), [selectorGroups]);
  const defaultMilkId = item.milk_types?.find(m => m.is_default)?.id ?? "";

  const powderList = !isLatte && item.allowed_powder_ids.length > 0
    ? [item.resolved_default_powder_id!, ...item.allowed_powder_ids.filter(id => id !== item.resolved_default_powder_id)]
    : [];

  // ── Pricing ──────────────────────────────────────────────────────────────
  const {
    getPriceForContext,
    currentPriceContext,
    finalUnitPrice,
    finalAddonsCost,
    totalCost,
    effectiveFreeVoucherId,
    effectiveFreeCoveredPrice
  } = usePriceMap({
    item, latteItems, powders, defaultPowderGrams, selectedSize, activePowderId,
    selectedMilkId, quantityMap, selectedOptionIds, selectedAddonVoucherIds,
    availableVouchers, selectedProductVoucherId, freeVoucherId, freeVoucherCoveredPriceVnd, quantity
  });

  const defaultPowderPriceCtx = getPriceForContext(selectedSize, item.resolved_default_powder_id ?? "");

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectorToggle = (groupId: string, optionId: string, defaultOptId?: string) => {
    const group = item.addon_groups.find(g => g.id === groupId);
    if (!group) return;
    const groupOptionIds = group.options.map((o) => o.id);
    setSelectedOptionIds((prev) => {
      if (prev.includes(optionId)) {
        const next = prev.filter((id) => id !== optionId);
        if (defaultOptId) next.push(defaultOptId);
        return next;
      }
      return [...prev.filter((id) => !groupOptionIds.includes(id)), optionId];
    });
  };

  const handleToggleChange = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  };

  const [isOpen, setIsOpen] = useState(true);

  // Pull-to-dismiss logic is handled by DismissableSheet.
  // Body scroll lock is handled by DismissableSheet.


  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 300); // wait for exit animation
  };

  const handleAddToCart = () => {
    const quantityAddonOptions = item.addon_groups
      .filter((g) => g.type === "QUANTITY")
      .flatMap((g) => {
        const qty = quantityMap[g.id] ?? 0;
        return qty > 0 && g.options[0] ? [{ option_id: g.options[0].id, quantity: qty }] : [];
      });

    const finalAddonVouchers = selectedAddonVoucherIds.map(vid => {
        const v = availableVouchers?.find(av => av.id === vid);
        return v ? { 
            addonOptionId: v.addon_option_id!, 
            voucherId: vid,
            discountVnd: currentPriceContext.addonPricesMap[v.addon_option_id!] ?? 0
        } : null;
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));

    const cartItemData = {
      menuItemId: item.id, name: item.name, category: item.category, imageUrl: item.image_url,
      size: selectedSize, unitPrice: finalUnitPrice, quantity, sweetness, iceOption, coldwhisk,
      note, selectedOptionIds, quantityMap, addonsPrice: currentPriceContext.addonsCost, addonPrices: currentPriceContext.addonPricesMap, quantityAddonOptions,
      selectedPowderId: isLatte ? undefined : selectedPowderId,
      selectedMilkTypeId: isLatte ? selectedMilkId : undefined,
      clientPriceVnd: finalUnitPrice,
      originalClientPriceVnd: currentPriceContext.unitPrice,
      addonVouchers: finalAddonVouchers,
      ...(effectiveFreeVoucherId ? { productVoucherId: effectiveFreeVoucherId, productVoucherDiscountVnd: effectiveFreeCoveredPrice } : {}),
    };

    if (onConfirm) {
      // Staff mode
      onConfirm({
        ...cartItemData,
        cartId: editingItem?.cartId || crypto.randomUUID(),
      } as CartItem);
    } else if (editingItem) {
      // Customer Edit mode
      updateItem(editingItem.cartId, cartItemData);
    } else {
      // Customer Add mode
      addItem(cartItemData as any);
    }
    
    handleClose();
  };

  const sweetnessIdx = SWEETNESS_OPTIONS.findIndex((o) => o.value === sweetness);

  return (
    <Profiler id="ProductModal" onRender={onRenderCallback}>
    <DismissableSheet
      open={isOpen}
      onClose={handleClose}
      springDamping={30}
      springStiffness={300}
      initialAnimation={isDesktop ? { opacity: 0, scale: 0.9, x: "-50%", y: "-50%" } : { y: "100%" }}
      animateAnimation={isDesktop ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { y: 0 }}
      exitAnimation={isDesktop ? { opacity: 0, scale: 0.9, x: "-50%", y: "-50%" } : { y: "100%" }}
      backdropClassName="bg-black/40 backdrop-blur-sm"
      zIndexBackdrop={100}
      zIndexSheet={101}
      disableDrag={isDesktop}
      sheetClassName="fixed inset-x-0 bottom-0 flex flex-col max-h-[92vh] overflow-hidden rounded-t-[2.5rem] bg-[#fdfcf7] shadow-2xl md:bottom-auto md:top-1/2 md:left-1/2 md:w-[90vw] md:max-w-4xl md:h-[80vh] md:max-h-[85vh] md:rounded-[2.5rem] md:grid md:grid-cols-2 md:pb-0"
      dragHandleContent={
        !isDesktop ? (
          <div className="absolute top-0 left-0 right-0 h-10 z-10 flex items-start justify-center pt-3">
            <div className="w-12 h-1.5 bg-border rounded-full" />
          </div>
        ) : undefined
      }
    >
      {({ onTouchStart, onTouchMove, onTouchEnd, ref: contentRef }) => (
        <>
          {/* Left Column (Desktop only) */}
        <div className="hidden md:flex flex-col bg-[#d9e4d4]/30 border-r border-border/40 p-8 justify-between relative h-full">
          {item.image_url ? (
            <div className="w-full aspect-square rounded-3xl overflow-hidden shadow-md bg-white flex items-center justify-center mb-6">
              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
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
          </div>
        </div>

        {/* Right Column (customization options + scrolled container) */}
        <button onClick={handleClose} className="absolute top-5 right-5 w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center hover:rotate-90 transition-transform z-10">
          <X className="w-5 h-5 text-primary" />
        </button>

        <div
          ref={contentRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="flex flex-col flex-1 min-h-0 h-full overflow-y-auto overscroll-contain px-5 md:px-8 pt-7 pb-44 md:pb-40 md:pt-0"
        >
          <div
            className="pt-7 pb-5 border-b border-border/40 md:hidden"
          >
            <h2 className="font-serif text-2xl font-bold text-primary">{item.name}</h2>
            {item.description && <p className="text-sm text-primary/55 mt-1.5 leading-relaxed">{item.description}</p>}
          </div>

          {/* 1. SIZE */}
          {item.sizes.length > 0 && (
            <div className="mt-7">
              <SectionLabel text="Chọn size *" />
              <SizeSelector
                sizes={item.sizes}
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
              <span className="text-xs font-bold text-primary bg-primary/8 px-2.5 py-1 rounded-full -mt-3">
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
                      "absolute -translate-x-1/2 text-[10px] whitespace-nowrap font-medium transition-colors",
                      sweetness === opt.value ? "text-primary font-bold" : "text-primary/40"
                    )}
                  >
                    {opt.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 3a. LATTE: Milk */}
          {isLatte && item.milk_types.length > 0 && (
            <div className="mt-7">
              <SectionLabel text="Loại sữa" />
              <MilkSelector
                milkTypes={item.milk_types}
                selectedMilkId={selectedMilkId}
                defaultMilkId={defaultMilkId}
                onChange={setSelectedMilkId}
                getPriceForContext={getPriceForContext}
                selectedSize={selectedSize}
                activePowderId={activePowderId}
              />
            </div>
          )}

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

          {/* 4. COLDWHISK */}
          <div className="mt-7">
            <SectionLabel text="Đánh lạnh (Coldwhisk)" />
            <div className="flex items-center justify-between bg-white rounded-2xl border-2 border-border px-5 py-4">
              <div>
                <p className="text-xs font-bold text-primary">Coldwhisk</p>
                <p className="text-[11px] text-primary/50 mt-0.5 font-medium">Foam matcha mịn màng</p>
              </div>
              <button
                onClick={() => {
                  setColdwhisk(!coldwhisk);
                }}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
                  coldwhisk ? "bg-primary" : "bg-primary/20"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                    coldwhisk ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>

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
                  group.options.filter(o => !o.is_default).map((opt) => {
                    const defaultOpt = group.options.find(o => o.is_default);
                    return (
                      <OptionCard
                        key={opt.id}
                        label={opt.label}
                        sub={opt.price_vnd > 0 ? `+${opt.price_vnd / 1000} ká` : undefined}
                        isActive={selectedOptionIds.includes(opt.id)}
                        onClick={() => handleSelectorToggle(group.id, opt.id, defaultOpt?.id)}
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
                      sub={opt.price_vnd > 0 ? `+${opt.price_vnd / 1000} ká` : undefined}
                      isActive={selectedOptionIds.includes(opt.id)}
                      onClick={() => handleToggleChange(opt.id)}
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
                {group.options.filter(o => !o.is_default).map((opt) => {
                  const defaultOpt = group.options.find(o => o.is_default);
                  const price = ceilTo1000(opt.gram_value != null ? opt.gram_value * activePowderPricePerGram : opt.price_vnd);
                  return (
                    <OptionCard
                      key={opt.id}
                      label={opt.label}
                      sub={price > 0 ? `+${price / 1000} ká` : (opt.is_default ? "Mặc định" : "0 ká")}
                      isActive={selectedOptionIds.includes(opt.id)}
                      onClick={() => handleSelectorToggle(group.id, opt.id, defaultOpt?.id)}
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
              const cost = ceilTo1000(amount * rawPricePerQty) / 1000;
              return `${amount}g: +${cost} ká`;
            }).join(", ") + (max > listLimit ? "..." : "");

            return (
              <div key={group.id} className="mt-7">
                <SectionLabel text={group.name} />
                <div className="flex items-center justify-between bg-white rounded-2xl border-2 border-border px-5 py-4">
                  <div>
                    <p className="text-xs font-bold text-primary">{group.name}</p>
                    <p className={cn("text-[10px] mt-0.5", rawPricePerQty > 0 ? "text-[#df5e5e] font-semibold" : "text-primary/50 font-medium")}>
                      {rawPricePerQty > 0 ? pricesStr : "Miễn phí"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-[#d9e4d4] rounded-xl px-3 py-2">
                    <button
                      onClick={() => setQuantityMap((p) => ({ ...p, [group.id]: Math.max(0, qty - 1) }))}
                      className="w-6 h-6 rounded-full bg-white/60 flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Minus className="w-3 h-3 text-primary" />
                    </button>
                    <span className="text-base font-bold w-5 text-center text-primary">{qty}</span>
                    <button
                      onClick={() => setQuantityMap((p) => ({ ...p, [group.id]: Math.min(max, qty + 1) }))}
                      className="w-6 h-6 rounded-full bg-white/60 flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Plus className="w-3 h-3 text-primary" />
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
              placeholder="Dặn dò thêm cho quán..."
              className="w-full rounded-2xl border-2 border-border bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[72px] resize-none"
            />
          </div>

          {/* 9. ƯU ĐÃI CỦA BẠN */}
          {(applicableProductVouchers.length > 0 || applicableAddonVouchers.length > 0) && (
            <div className="mt-7">
              <SectionLabel text="🎟 Ưu đãi có thể áp dụng" />
              <div className="space-y-2">
                {applicableProductVouchers.map(v => {
                  const isSelected = selectedProductVoucherId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedProductVoucherId(isSelected ? null : v.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors",
                        isSelected ? "bg-orange-50 border-orange-200" : "bg-card border-border hover:bg-orange-50/30"
                      )}
                    >
                      <div>
                        <p className="font-bold text-sm flex items-center gap-2 text-primary">
                          <Ticket size={14} className="text-orange-500" /> {v.package.name}
                        </p>
                        {v.covered_price_vnd && (
                          <p className="text-[11px] text-orange-600/80 mt-1 font-medium">Giảm tối đa {(v.covered_price_vnd / 1000).toLocaleString('vi-VN')}k</p>
                        )}
                      </div>
                      {isSelected && <CheckCircle2 size={18} className="text-orange-500 shrink-0 ml-2" />}
                    </button>
                  );
                })}
                {applicableAddonVouchers.map(v => {
                  const isSelected = selectedAddonVoucherIds.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedAddonVoucherIds(prev => isSelected ? prev.filter(id => id !== v.id) : [...prev, v.id])}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-colors",
                        isSelected ? "bg-green-50 border-green-200" : "bg-card border-border hover:bg-green-50/30"
                      )}
                    >
                      <div>
                        <p className="font-bold text-sm flex items-center gap-2 text-primary">
                          <Ticket size={14} className="text-green-600" /> Free {v.addonOption?.label || "Topping"}
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
          hideQuantityPicker={hideQuantityPicker}
          handleAddToCart={handleAddToCart}
          isEditing={!!editingItem}
        />
        </>
      )}
    </DismissableSheet>
    </Profiler>
  );
};

const LatteModal: React.FC<ProductModalProps> = (props) => <BaseModal {...props} />;
const FusionModal: React.FC<ProductModalProps> = (props) => <BaseModal {...props} />;

export default function ProductModal(props: ProductModalProps) {
  if (props.item.category === "latte") return <LatteModal {...props} />;
  if (props.item.category === "fusion") return <FusionModal {...props} />;
  return null;
}
