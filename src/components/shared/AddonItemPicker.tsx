"use client";

import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useCartStore } from "@/src/lib/store/cartStore";
import MenuCard from "@/src/components/menu/MenuCard";
import type { CartItem, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { ceilTo1000 } from "@/src/utils/pricing";
import type { PendingAddonVoucherIntent } from "@/src/lib/store/cartStore";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { hasAddonVoucherForOption, resolveAddonVoucherOptionId } from "@/src/utils/voucherMatchUtils";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";

interface AddonItemPickerProps {
  voucher: MyVoucher;
  cartItems: Array<CartItem | ProjectedCartLine>;
  bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>;
  menuData: MenuData;
  /** Lock voucher edits while the wallet query is loading or revalidating. */
  canEdit?: boolean;
  onBack?: () => void;
  embedded?: boolean;
  onSuccess: () => void;
  onPending?: (intent: PendingAddonVoucherIntent) => void;
  onApplyVoucher?: (
    cartId: string,
    voucherId: string,
    addonOptionId: string,
    context: {
      groupOptionIds: string[];
      maxSelect: number;
      isExtraMatcha: boolean;
      replaceOptionId?: string;
    },
  ) => CartMutationResult;
  onSavePendingVoucher?: (intent: PendingAddonVoucherIntent) => void;
}

export const AddonItemPicker = ({
  voucher,
  cartItems,
  bundleAllocatedQuantitiesByCartId,
  menuData,
  canEdit = true,
  onBack,
  embedded = false,
  onSuccess,
  onPending,
  onApplyVoucher,
  onSavePendingVoucher,
}: AddonItemPickerProps) => {
  const { applyAddonVoucher, setCartOpen, setPendingAddonVoucher } = useCartStore();
  const applyVoucher = onApplyVoucher ?? applyAddonVoucher;
  const addonTargets = voucher.eligible_addon_options?.filter((option) => option.is_active && !option.is_dynamic_gram) ?? [];
  const [selectedAddonOptionId, setSelectedAddonOptionId] = useState(
    resolveAddonVoucherOptionId(voucher) ?? "",
  );
  const [conflict, setConflict] = useState<{ item: ProjectedCartLine; replaceOptionId: string; intent: PendingAddonVoucherIntent } | null>(null);
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
        groupOptionIds: group.options.map((candidate) => candidate.id),
        isExtraMatcha: group.is_dynamic_gram || option.gram_value !== null,
      };
    }
    return null;
  };

  const savePendingAndExit = (intent: PendingAddonVoucherIntent) => {
    if (!canEdit) return;
    if (onSavePendingVoucher) onSavePendingVoucher(intent);
    else {
      setPendingAddonVoucher(intent);
      setCartOpen(false);
    }
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
    const result = applyVoucher(item.cartId, voucher.qr_token, addonOptionId, {
      groupOptionIds: targetGroupOptionIds,
      maxSelect: targetMaxSelect,
      isExtraMatcha,
    });
    if (!result.ok) {
      void import("sonner").then(({ toast }) => toast.error(result.message));
      return;
    }
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
    const result = applyVoucher(item.cartId, voucher.qr_token, intent.addonOptionId, {
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
    onSuccess();
  };

  return (
    <section
      className={embedded ? "space-y-3" : "absolute inset-0 z-20 flex flex-col space-y-3 overflow-y-auto bg-background p-5"}
      aria-labelledby="addon-voucher-targets"
    >
        {!embedded && onBack ? (
          <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 self-start rounded-xl px-2 font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-5" /> Quay lại
          </button>
        ) : null}
        <div>
          <h5 id="addon-voucher-targets" className="text-xs font-bold uppercase tracking-widest text-primary/50">Chọn món áp dụng</h5>
          <p className="mt-1 text-xs text-muted-foreground">Chọn topping của voucher, sau đó chọn ly trong giỏ.</p>
        </div>
        {addonTargets.length > 1 ? <div className="space-y-2"><p className="text-sm font-semibold">Chọn addon được tặng</p>{addonTargets.map((option) => <button type="button" key={option.addon_option_id} disabled={!canEdit} onClick={() => setSelectedAddonOptionId(option.addon_option_id)} className={`min-h-11 w-full rounded-xl border px-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${selectedAddonOptionId === option.addon_option_id ? "border-primary bg-primary/10" : "border-input"}`}>{option.label}</button>)}</div> : null}
        {eligibleDrinkItems.length === 0 && selectedAddonOptionId ? <button type="button" disabled={!canEdit} onClick={() => { const intent = resolveIntent(selectedAddonOptionId); if (intent) savePendingAndExit(intent); }} className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Chọn món mới</button> : null}
        {eligibleDrinkItems.map(item => (
          item.menuItem ? (
            <div key={item.cartId} className={!canEdit ? "opacity-50" : undefined}>
              <MenuCard
                item={item.menuItem}
                milkTypes={menuData.milk_types}
                compact
                disabled={!canEdit}
                allowedSizes={item.configuration.size ? [item.configuration.size] : undefined}
                onItemClick={() => handleSelectItem(item)}
              />
            </div>
          ) : null
        ))}
      <ConfirmModal isOpen={conflict !== null} title="Nhóm addon đã đủ" message="Thay addon đang chọn bằng addon của voucher? Chọn giữ nguyên sẽ lưu voucher để áp dụng cho món mới tiếp theo." confirmLabel="Thay addon" cancelLabel="Giữ nguyên" onConfirm={replaceAndApply} onCancel={() => { if (conflict) savePendingAndExit(conflict.intent); setConflict(null); }} />
    </section>
  );
};
