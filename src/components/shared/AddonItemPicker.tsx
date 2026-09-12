"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { CartItem, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { ceilTo1000 } from "@/src/utils/pricing";
import type { PendingAddonVoucherIntent } from "@/src/lib/store/cartStore";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { hasAddonVoucherForOption, resolveAddonVoucherOptionId } from "@/src/utils/voucherMatchUtils";

interface AddonItemPickerProps {
  voucher: MyVoucher;
  cartItems: Array<CartItem | ProjectedCartLine>;
  bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>;
  menuData: MenuData;
  /** Lock voucher edits while the wallet query is loading or revalidating. */
  canEdit?: boolean;
  onBack: () => void;
  onSuccess: () => void;
  onPending?: (intent: PendingAddonVoucherIntent) => void;
}

export const AddonItemPicker = ({
  voucher,
  cartItems,
  bundleAllocatedQuantitiesByCartId,
  menuData,
  canEdit = true,
  onBack,
  onSuccess,
  onPending,
}: AddonItemPickerProps) => {
  const { applyAddonVoucher, setCartOpen, setPendingAddonVoucher } = useCartStore();
  const addonTargets = voucher.eligible_addon_options?.filter((option) => option.is_active && !option.is_dynamic_gram) ?? [];
  const [selectedAddonOptionId, setSelectedAddonOptionId] = useState(
    resolveAddonVoucherOptionId(voucher) ?? "",
  );
  const [conflict, setConflict] = useState<{ item: ProjectedCartLine; replaceOptionId: string; intent: PendingAddonVoucherIntent } | null>(null);
  const attemptedSingletonApply = useRef(false);
  const projectedItems = cartItems.flatMap((item): ProjectedCartLine[] => {
    if ("grossUnitPriceVnd" in item) return [item];
    const menuItem = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])].find((candidate) => candidate.id === item.menuItemId);
    if (!menuItem) return [];
    return [{
      ...item,
      name: menuItem.name,
      imageUrl: menuItem.image_url,
      category: menuItem.category,
      menuItem,
      resolvedAddons: [],
      drinkPriceVnd: 0,
      addonsPriceVnd: 0,
      grossUnitPriceVnd: 0,
      personalVoucherDiscountVnd: 0,
      bundleDiscountVnd: 0,
      payableUnitVnd: 0,
      lineTotalVnd: 0,
      errors: [],
      revalidating: true,
    }];
  });
  const eligibleDrinkItems = projectedItems.filter((item) =>
    item.configuration.size !== null &&
    !hasAddonVoucherForOption(item, selectedAddonOptionId) &&
    (bundleAllocatedQuantitiesByCartId.get(item.cartId) ?? 0) < item.quantity,
  );

  const resolveIntent = (addonOptionId: string): PendingAddonVoucherIntent | null => {
    for (const group of menuData.addon_groups) {
      const option = group.options.find((candidate) => candidate.id === addonOptionId);
      if (option && option.gram_value == null) return {
        voucherId: voucher.qr_token,
        addonOptionId,
        priceVnd: ceilTo1000(option.price_vnd ?? 0),
        addonGroupId: group.id,
        maxSelect: group.max_select,
      };
    }
    return null;
  };

  const savePendingAndExit = (intent: PendingAddonVoucherIntent) => {
    if (!canEdit) return;
    setPendingAddonVoucher(intent);
    setCartOpen(false);
    onPending?.(intent);
  };

  const handleSelectItem = (item: ProjectedCartLine) => {
    if (!canEdit) return;
    const addonOptionId = selectedAddonOptionId;
    if (!addonOptionId || hasAddonVoucherForOption(item, addonOptionId)) return;
    if ((bundleAllocatedQuantitiesByCartId.get(item.cartId) ?? 0) >= item.quantity) {
      void import("sonner").then(({ toast }) => toast.error("Món này đang thuộc ưu đãi BUNDLE"));
      return;
    }

    let isExtraMatcha = false;
    let targetGroupId = "";
    let targetMaxSelect = 1;
    // Find price from menuData.addon_groups
    for (const group of menuData.addon_groups) {
      const opt = group.options.find(o => o.id === addonOptionId);
      if (opt) {
        targetGroupId = group.id;
        targetMaxSelect = group.max_select;
        if (opt.gram_value != null && opt.gram_value > 0) {
          isExtraMatcha = true;
        }
        break;
      }
    }

    if (isExtraMatcha) {
      import("sonner").then(m => m.toast.error("Voucher này không áp dụng cho Extra Matcha"));
      return;
    }

    if (item.configuration.size === null) return;
    const alreadyHasAddon = item.configuration.addonOptionIds.includes(addonOptionId);
    const targetGroupOptionIds = menuData.addon_groups.find((group) => group.id === targetGroupId)?.options.map((option) => option.id) ?? [];
    const targetGroupOptionSet = new Set(targetGroupOptionIds);
    const groupOptions = item.configuration.addonOptionIds.filter((optionId) => targetGroupOptionSet.has(optionId));
    if (!alreadyHasAddon && groupOptions.length >= targetMaxSelect) {
      const intent = resolveIntent(addonOptionId);
      if (intent) setConflict({ item, replaceOptionId: groupOptions[0], intent });
      return;
    }
    const intent = resolveIntent(addonOptionId);
    if (!intent) return;
    const result = applyAddonVoucher(item.cartId, voucher.qr_token, addonOptionId, {
      groupOptionIds: targetGroupOptionIds,
      maxSelect: targetMaxSelect,
      isExtraMatcha,
    });
    if (!result.ok) {
      void import("sonner").then(({ toast }) => toast.error(result.message));
      return;
    }
    setCartOpen(true);
    onSuccess();
  };

  const replaceAndApply = () => {
    if (!canEdit || !conflict) return;
    const { item, replaceOptionId, intent } = conflict;
    if ((bundleAllocatedQuantitiesByCartId.get(item.cartId) ?? 0) >= item.quantity) {
      setConflict(null);
      void import("sonner").then(({ toast }) => toast.error("Món này đang thuộc ưu đãi BUNDLE"));
      return;
    }
    const groupOptionIds = menuData.addon_groups.find((group) => group.id === intent.addonGroupId)?.options.map((option) => option.id) ?? [];
    const result = applyAddonVoucher(item.cartId, voucher.qr_token, intent.addonOptionId, {
      groupOptionIds,
      maxSelect: intent.maxSelect,
      isExtraMatcha: false,
      replaceOptionId,
    });
    if (!result.ok) {
      void import("sonner").then(({ toast }) => toast.error(result.message));
      setConflict(null);
      return;
    }
    setConflict(null);
    setCartOpen(true);
    onSuccess();
  };

  useEffect(() => {
    if (
      attemptedSingletonApply.current ||
      !canEdit ||
      addonTargets.length > 1 ||
      eligibleDrinkItems.length !== 1 ||
      !selectedAddonOptionId
    ) return;
    attemptedSingletonApply.current = true;
    handleSelectItem(eligibleDrinkItems[0]);
    // Singleton ADDON keeps the legacy one-drink auto-apply behavior; conflict handling stays in the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addonTargets.length, canEdit, eligibleDrinkItems.length, selectedAddonOptionId]);

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-0 z-20 bg-[#fdfcf7] flex flex-col"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-white">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h3 className="font-bold text-primary">Chọn món áp dụng</h3>
      </div>
      <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none p-5 space-y-3 overscroll-contain">
        {addonTargets.length > 1 ? <div className="space-y-2"><p className="text-sm font-semibold">Chọn addon được tặng</p>{addonTargets.map((option) => <button type="button" key={option.addon_option_id} disabled={!canEdit} onClick={() => setSelectedAddonOptionId(option.addon_option_id)} className={`min-h-11 w-full rounded-xl border px-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${selectedAddonOptionId === option.addon_option_id ? "border-primary bg-primary/10" : "border-input"}`}>{option.label}</button>)}</div> : null}
        {eligibleDrinkItems.length === 0 && selectedAddonOptionId ? <button type="button" disabled={!canEdit} onClick={() => { const intent = resolveIntent(selectedAddonOptionId); if (intent) savePendingAndExit(intent); }} className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Chọn món mới</button> : null}
        {eligibleDrinkItems.map(item => (
          <button
            key={item.cartId}
            type="button"
            disabled={!canEdit}
            onClick={() => handleSelectItem(item)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-border/40 rounded-xl text-left hover:border-primary/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden relative bg-secondary/10">
              {item.imageUrl && (
                <Image src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" />
              )}
            </div>
            <div>
              <p className="font-bold text-sm text-primary">{item.name}</p>
              <p className="text-xs text-primary/60">Size <SizeLabel size={item.configuration.size} /> • {(item.grossUnitPriceVnd / 1000).toLocaleString("vi-VN")}K</p>
            </div>
          </button>
        ))}
      </div>
      <ConfirmModal isOpen={conflict !== null} title="Nhóm addon đã đủ" message="Thay addon đang chọn bằng addon của voucher? Chọn giữ nguyên sẽ lưu voucher để áp dụng cho món mới tiếp theo." confirmLabel="Thay addon" cancelLabel="Giữ nguyên" onConfirm={replaceAndApply} onCancel={() => { if (conflict) savePendingAndExit(conflict.intent); setConflict(null); }} />
    </motion.div>
  );
};
