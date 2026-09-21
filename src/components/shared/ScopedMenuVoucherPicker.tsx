"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import ProductModal from "@/src/components/shared/ProductModal";
import MenuCard from "@/src/components/menu/MenuCard";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData, MenuItem, Size } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherEligibleMenuItem } from "@/src/services/customerVoucherService";

interface ScopedMenuVoucherPickerProps {
  voucher: MyVoucher;
  menuData: MenuData;
  /** Lock voucher edits while the wallet query is loading or revalidating. */
  canEdit?: boolean;
  onSuccess: () => void;
}

/** Lets a customer choose and configure exactly one scoped PRODUCT or ITEM reward. */
export function ScopedMenuVoucherPicker({ voucher, menuData, canEdit = true, onSuccess }: ScopedMenuVoucherPickerProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [picked, setPicked] = useState<{ item: MenuItem; target: VoucherEligibleMenuItem } | null>(null);
  const menuItems = useMemo(
    () => [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])],
    [menuData],
  );
  const targets = (voucher.eligible_menu_items ?? []).filter((target) => target.is_available);

  const confirm = (cartItem: CartItem) => {
    if (!canEdit || !picked) return;
    const { cartId: _cartId, ...withoutId } = cartItem;
    void _cartId;
    const result = addItem(withoutId);
    if (!result.ok) { toast.error(result.message); return; }
    queueMicrotask(onSuccess);
  };

  const pickTarget = (target: VoucherEligibleMenuItem) => {
    if (!canEdit) return;
    const item = menuItems.find((candidate) => candidate.id === target.menu_item_id);
    if (!item) {
      toast.error("Món này không còn khả dụng");
      return;
    }
    if (voucher.voucher_type === "ITEM") {
      if (item.category !== "extras" || item.unit_price_vnd == null) {
        toast.error("Món tặng này không còn khả dụng");
        return;
      }
      const result = addItem({
        menuItemId: item.id,
        quantity: 1,
        configuration: { size: null, note: "" },
        lineVoucher: { token: voucher.qr_token, kind: "ITEM" },
        addonVouchers: [],
      });
      if (!result.ok) { toast.error(result.message); return; }
      queueMicrotask(onSuccess);
      return;
    }
    setPicked({ item, target });
  };

  if (picked) {
    const { item, target } = picked;
    const size = target.size as Size | null | undefined;
    return <ProductModal
      item={item}
      latteItems={menuData.latte}
      milkTypes={menuData.milk_types}
      addonGroups={menuData.addon_groups}
      initialSize={size}
      initialPowderId={target.matcha_powder_id}
      initialBaseLiquidId={target.milk_type_id}
      disableVoucherApplication
      freeVoucherId={voucher.qr_token}
      freeVoucherCoveredPriceVnd={voucher.voucher_type === "PRODUCT" ? target.covered_price_vnd ?? 0 : undefined}
      nested
      ctaLabel="Thêm món được tặng"
      onClose={() => setPicked(null)}
      onConfirm={confirm}
    />;
  }

  return (
    <section className="space-y-3" aria-labelledby="voucher-menu-targets">
      <div>
        <h5 id="voucher-menu-targets" className="text-xs font-bold uppercase tracking-widest text-primary/50">Chọn món áp dụng</h5>
        <p className="mt-1 text-xs text-muted-foreground">Chạm vào món để tùy chỉnh rồi thêm thẳng vào giỏ.</p>
      </div>
      {targets.map((target) => {
        const item = menuItems.find((candidate) => candidate.id === target.menu_item_id);
        if (!item) return null;
        const allowedSizes = target.size ? [target.size as Size] : undefined;
        return (
          <div key={target.menu_item_id} className={!canEdit ? "opacity-50" : undefined}>
            <MenuCard
              item={item}
              milkTypes={menuData.milk_types}
              compact
              disabled={!canEdit}
              allowedSizes={allowedSizes}
              onItemClick={() => pickTarget(target)}
            />
          </div>
        );
      })}
    </section>
  );
}
