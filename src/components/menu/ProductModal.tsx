"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import type { MenuItem, SweetnessLevel, Size } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import { useCartStore } from "@/src/lib/store/cartStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { cn } from "@/src/utils/cn";
import { calcLattePrice, calcFusionPrice, resolveGram, ceilTo1000 } from "@/src/utils/pricing";
import { SWEETNESS_OPTIONS, ICE_OPTIONS, SIZE_LABELS } from "@/src/constants/orderOptions";

interface ProductModalProps {
  item: MenuItem;
  latteItems: MenuItem[];
  onClose: () => void;
}

// Reusable card-style option button
function OptionCard({
  label, sub, isActive, onClick,
}: { label: string; sub?: string; isActive: boolean; onClick: () => void }) {
  const isPriceAddition = sub?.startsWith("+");
  const isSizePrice = sub && sub.endsWith("k") && !sub.startsWith("+") && !sub.startsWith("-");

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 py-3 px-2 text-center transition-all min-w-0 h-full",
        isActive ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:border-primary/30"
      )}
    >
      <span className={cn("text-xs font-bold leading-tight", isActive ? "text-primary" : "text-primary/70")}>{label}</span>
      {sub && (
        <span
          className={cn(
            "text-[10px] mt-0.5",
            isSizePrice
              ? "text-xs text-black"
              : isPriceAddition
                ? "text-[#df5e5e] font-semibold"
                : cn("font-medium", isActive ? "text-primary/60" : "text-primary/40")
          )}
        >
          {sub}
        </span>
      )}
    </button>
  );
}

const BaseModal: React.FC<ProductModalProps> = ({ item, latteItems, onClose }) => {
  const { addItem } = useCartStore();
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
    const available = item.sizes ?? [];
    return (available.find((s) => s.size === "L") ?? available[0])?.size ?? "M";
  });
  const [sweetness, setSweetness] = useState<SweetnessLevel>("QUARTER");
  const [iceOption, setIceOption] = useState<IceOption>("NORMAL");
  const [coldwhisk, setColdwhisk] = useState(false);
  const [selectedPowderId, setSelectedPowderId] = useState<string>(item.resolved_default_powder_id ?? "");
  const [selectedMilkId, setSelectedMilkId] = useState<string>(() =>
    item.milk_types?.find(m => m.is_default)?.id ?? item.milk_types?.[0]?.id ?? ""
  );
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() =>
    item.addon_groups.flatMap((g) => g.options.filter((o) => o.is_default).map((o) => o.id))
  );
  const [quantityMap, setQuantityMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(item.addon_groups.filter((g) => g.type === "QUANTITY").map((g) => [g.id, 0]))
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

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
  const getPriceForContext = (targetSize: Size, targetPowderId: string, milkId?: string) => {
    const sizeObj = item.sizes.find((s) => s.size === targetSize);
    const base_price_vnd = sizeObj?.base_price_vnd ?? 0;
    const pwd = powders.find((p) => p.id === targetPowderId);
    const pwd_price_per_gram = pwd?.price_per_gram ?? 0;
    const gram = resolveGram(targetSize, item.custom_powder_grams, pwd?.size_config ?? [], defaultPowderGrams);

    let baseDrinkPrice = 0;
    if (isLatte) {
      const milk_ml = sizeObj?.milk_ml ?? 0;
      const milk = item.milk_types?.find((m) => m.id === (milkId ?? selectedMilkId));
      const milk_price_per_ml = milk?.price_per_ml ?? 40;
      baseDrinkPrice = calcLattePrice({ base_price_vnd, gram, powder_price_per_gram: pwd_price_per_gram, milk_ml, milk_price_per_ml });
    } else {
      let premium_latte = 0;
      const defaultPowder = powders.find((p) => p.id === item.resolved_default_powder_id);
      if (pwd?.reference_latte_item_id && defaultPowder?.reference_latte_item_id) {
        const selBase = latteItems.find((i) => i.id === pwd.reference_latte_item_id)?.sizes.find((s) => s.size === targetSize)?.base_price_vnd ?? 0;
        const defBase = latteItems.find((i) => i.id === defaultPowder.reference_latte_item_id)?.sizes.find((s) => s.size === targetSize)?.base_price_vnd ?? 0;
        premium_latte = selBase - defBase;
      }
      baseDrinkPrice = calcFusionPrice({ base_price_vnd, gram, powder_price_per_gram: pwd_price_per_gram, premium_latte });
    }

    let addonsCost = 0;
    const addonPricesMap: Record<string, number> = {};

    for (const g of item.addon_groups) {
      if (g.type === "QUANTITY") {
        const qty = quantityMap[g.id] ?? 0;
        const opt = g.options[0];
        if (qty > 0 && opt) {
          const rawCost = qty * (opt.gram_value != null ? opt.gram_value * pwd_price_per_gram : opt.price_vnd);
          const lineCost = ceilTo1000(rawCost);
          addonsCost += lineCost;
          // Store unit price for addon voucher deduction
          addonPricesMap[opt.id] = ceilTo1000(opt.gram_value != null ? opt.gram_value * pwd_price_per_gram : opt.price_vnd);
        }
      } else {
        for (const opt of g.options) {
          if (selectedOptionIds.includes(opt.id)) {
            const rawCost = opt.gram_value != null ? opt.gram_value * pwd_price_per_gram : opt.price_vnd;
            const lineCost = ceilTo1000(rawCost);
            addonsCost += lineCost;
            addonPricesMap[opt.id] = lineCost;
          }
        }
      }
    }
    return { baseDrinkPrice, addonsCost, unitPrice: baseDrinkPrice + addonsCost, addonPricesMap };
  };

  const currentPriceContext = getPriceForContext(selectedSize, activePowderId);
  const defaultPowderPriceCtx = getPriceForContext(selectedSize, item.resolved_default_powder_id ?? "");
  const totalCost = currentPriceContext.unitPrice * quantity;

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

  const handleAddToCart = () => {
    const quantityAddonOptions = item.addon_groups
      .filter((g) => g.type === "QUANTITY")
      .flatMap((g) => {
        const qty = quantityMap[g.id] ?? 0;
        return qty > 0 && g.options[0] ? [{ option_id: g.options[0].id, quantity: qty }] : [];
      });

    const details: string[] = [];
    details.push(`Size ${selectedSize}`);
    
    const sweetnessLabel = SWEETNESS_OPTIONS.find(o => o.value === sweetness)?.label;
    if (sweetnessLabel) details.push(sweetnessLabel);
    
    let hasDaDua = false;
    for (const group of item.addon_groups) {
      if (group.name.toLowerCase().includes("đá dừa")) {
        if (group.options.some(o => selectedOptionIds.includes(o.id) && !o.is_default)) {
          hasDaDua = true;
        }
      }
    }
    const iceLabel = ICE_OPTIONS.find(o => o.value === iceOption)?.label;
    if (hasDaDua) {
      details.push(iceOption !== "NORMAL" ? `${iceLabel} (Đá dừa)` : "Đá dừa");
    } else if (iceOption !== "NORMAL" && iceLabel) {
      details.push(`Đá: ${iceLabel}`);
    }
    
    if (coldwhisk) details.push("Đánh lạnh foam");

    if (isLatte && selectedMilkId !== defaultMilkId) {
      const milk = item.milk_types?.find(m => m.id === selectedMilkId);
      if (milk) details.push(`Sữa: ${milk.name}`);
    }

    let extraMatchaStr = "";
    for (const group of item.addon_groups) {
      if (group.name.toLowerCase().includes("matcha") && group.type === "SELECTOR") {
        const opt = group.options.find(o => selectedOptionIds.includes(o.id) && !o.is_default);
        if (opt) extraMatchaStr = ` ${opt.label}`;
      }
    }
    const powderName = activePowder?.name;
    if (powderName) {
      details.push(`Bột: ${powderName}${extraMatchaStr}`);
    }

    for (const group of item.addon_groups) {
      const isMatcha = group.name.toLowerCase().includes("matcha");
      const isDaDua = group.name.toLowerCase().includes("đá dừa");
      if (isMatcha || isDaDua) continue;

      if (group.type === "QUANTITY") {
        const qty = quantityMap[group.id] ?? 0;
        if (qty > 0) details.push(`${qty}x ${group.name}`);
      } else {
        const selectedGroupOptions = group.options.filter(o => selectedOptionIds.includes(o.id) && !o.is_default);
        for (const opt of selectedGroupOptions) {
           details.push(opt.label);
        }
      }
    }

    if (note.trim()) details.push(`Ghi chú: ${note.trim()}`);

    addItem({
      menuItemId: item.id, name: item.name, category: item.category, imageUrl: item.image_url,
      size: selectedSize, unitPrice: currentPriceContext.unitPrice, quantity, sweetness, iceOption, coldwhisk,
      note, selectedOptionIds, quantityMap, addonsPrice: currentPriceContext.addonsCost, addonPrices: currentPriceContext.addonPricesMap, quantityAddonOptions,
      selectedPowderId: isLatte ? undefined : selectedPowderId,
      selectedMilkTypeId: isLatte ? selectedMilkId : undefined,
      clientPriceVnd: currentPriceContext.unitPrice,
      originalClientPriceVnd: currentPriceContext.unitPrice,
      details,
    });
    onClose();
  };

  const sweetnessIdx = SWEETNESS_OPTIONS.findIndex((o) => o.value === sweetness);
  const SectionLabel = ({ text }: { text: string }) => (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/40 mb-3">{text}</p>
  );

  return (
    <AnimatePresence>
      <motion.div
        key="pm-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        key="pm-sheet"
        initial={isDesktop ? { opacity: 0, scale: 0.9, x: "-50%", y: "-50%" } : { y: "100%" }}
        animate={isDesktop ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { y: 0 }}
        exit={isDesktop ? { opacity: 0, scale: 0.9, x: "-50%", y: "-50%" } : { y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[101] max-h-[92vh] overflow-y-auto md:overflow-hidden rounded-t-[2.5rem] bg-[#fdfcf7] shadow-2xl md:bottom-auto md:top-1/2 md:left-1/2 md:w-[90vw] md:max-w-4xl md:h-[80vh] md:max-h-[85vh] md:rounded-[2.5rem] md:grid md:grid-cols-2 md:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
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
        <button onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center hover:rotate-90 transition-transform z-10">
          <X className="w-5 h-5 text-primary" />
        </button>

        <div className="flex flex-col h-full overflow-y-auto px-5 md:px-8 pt-7 pb-44 md:pb-40 md:pt-0">
          <div className="pt-7 pb-5 border-b border-border/40 md:hidden">
            <h2 className="font-serif text-2xl font-bold text-primary">{item.name}</h2>
            {item.description && <p className="text-sm text-primary/55 mt-1.5 leading-relaxed">{item.description}</p>}
          </div>

          {/* 1. SIZE */}
          {item.sizes.length > 0 && (
            <div className="mt-7">
              <SectionLabel text="Chọn size *" />
              <div className="grid grid-cols-3 gap-2.5">
                {item.sizes.map((s) => {
                  const sizePrice = getPriceForContext(s.size, activePowderId).unitPrice;
                  return (
                    <OptionCard
                      key={s.size}
                      label={SIZE_LABELS[s.size]}
                      sub={`${sizePrice / 1000}k`}
                      isActive={selectedSize === s.size}
                      onClick={() => setSelectedSize(s.size)}
                    />
                  );
                })}
              </div>
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
            <div className="relative">
              <div className="h-1.5 bg-primary/15 rounded-full mx-2">
                <div
                  className="absolute inset-y-0 left-2 bg-primary rounded-full transition-all duration-200 h-1.5"
                  style={{ width: `calc(${(sweetnessIdx / (SWEETNESS_OPTIONS.length - 1)) * 100}% - 0px)` }}
                />
              </div>
              <div className="absolute inset-x-2 top-0 h-1.5">
                {SWEETNESS_OPTIONS.map((opt, i) => {
                  const pct = (i / (SWEETNESS_OPTIONS.length - 1)) * 100;
                  const isActive = i === sweetnessIdx;
                  const isFilled = i <= sweetnessIdx;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSweetness(opt.value)}
                      style={{ left: `${pct}%` }}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 focus:outline-none"
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
              <div className="relative mt-6 mx-2 h-5">
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
              <div className="grid grid-cols-3 gap-2">
                {item.milk_types.map((milk) => {
                  const isDefault = milk.id === defaultMilkId;
                  const milkPrice = getPriceForContext(selectedSize, activePowderId, milk.id).baseDrinkPrice;
                  const defMilkPrice = getPriceForContext(selectedSize, activePowderId, defaultMilkId).baseDrinkPrice;
                  const diff = milkPrice - defMilkPrice;
                  return (
                    <OptionCard
                      key={milk.id}
                      label={milk.name}
                      sub={isDefault ? "Mặc định" : diff > 0 ? `+${diff / 1000}k` : diff < 0 ? `${diff / 1000}k` : "Cùng giá"}
                      isActive={selectedMilkId === milk.id}
                      onClick={() => setSelectedMilkId(milk.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 3b. FUSION: Powder */}
          {powderList.length > 0 && (
            <div className="mt-7">
              <SectionLabel text="Loại bột matcha" />
              <div className="grid grid-cols-3 gap-2">
                {powderList.map((pid) => {
                  const pwd = powders.find((p) => p.id === pid);
                  if (!pwd) return null;
                  const isDefault = pid === item.resolved_default_powder_id;
                  const priceCtx = getPriceForContext(selectedSize, pid);
                  const diff = priceCtx.unitPrice - defaultPowderPriceCtx.unitPrice;
                  return (
                    <OptionCard
                      key={pid}
                      label={pwd.name}
                      sub={isDefault ? "Mặc định" : diff !== 0 ? `${diff > 0 ? "+" : ""}${diff / 1000}k` : "Cùng giá"}
                      isActive={selectedPowderId === pid}
                      onClick={() => setSelectedPowderId(pid)}
                    />
                  );
                })}
              </div>
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
                onClick={() => setColdwhisk(!coldwhisk)}
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
                        sub={opt.price_vnd > 0 ? `+${opt.price_vnd / 1000}k` : undefined}
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
                      sub={opt.price_vnd > 0 ? `+${opt.price_vnd / 1000}k` : undefined}
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
                      sub={price > 0 ? `+${price / 1000}k` : (opt.is_default ? "Mặc định" : "0k")}
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
              return `${amount}g: +${cost}k`;
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
        </div>

        {/* BOTTOM CTA */}
        <div className="fixed md:absolute bottom-0 left-0 md:left-auto right-0 z-[110] w-full md:w-1/2 bg-[#fdfcf7]/95 backdrop-blur-md border-t border-border/60 px-5 py-4 pb-8 md:pb-6 md:rounded-br-[2.5rem]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0 bg-[#d9e4d4] rounded-2xl overflow-hidden shrink-0">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-11 flex items-center justify-center hover:bg-primary/10 transition-colors text-primary font-bold text-lg"
              >−</button>
              <span className="text-sm font-bold w-6 text-center text-primary">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-11 flex items-center justify-center hover:bg-primary/10 transition-colors text-primary font-bold text-lg"
              >+</button>
            </div>
            <button
              onClick={handleAddToCart}
              className="flex-1 bg-primary text-white rounded-2xl h-11 font-bold text-sm shadow-lg active:scale-[0.98] transition-all flex items-center justify-between px-5"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                <span>Thêm vào giỏ</span>
              </div>
              <span className="font-serif font-bold">{totalCost / 1000}k 🐟</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

const LatteModal: React.FC<ProductModalProps> = (props) => <BaseModal {...props} />;
const FusionModal: React.FC<ProductModalProps> = (props) => <BaseModal {...props} />;

export default function ProductModal(props: ProductModalProps) {
  if (props.item.category === "latte") return <LatteModal {...props} />;
  if (props.item.category === "fusion") return <FusionModal {...props} />;
  return null;
}
