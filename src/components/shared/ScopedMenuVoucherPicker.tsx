"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ProductModal from "@/src/components/shared/ProductModal";
import MenuCard from "@/src/components/menu/MenuCard";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData, MenuItem, Size } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherEligibleMenuItem } from "@/src/services/customerVoucherService";

interface ScopedMenuVoucherPickerProps {
  voucher: MyVoucher;
  open?: boolean;
  onChildOpenChange?: (open: boolean) => void;
  onAddItem?: (item: Omit<CartItem, "cartId">) => CartMutationResult<unknown>;
  menuData: MenuData;
  /** Lock voucher edits while the wallet query is loading or revalidating. */
  canEdit?: boolean;
  onSuccess: () => void;
}

/** Lets a customer choose and configure exactly one scoped PRODUCT or ITEM reward. */
export function ScopedMenuVoucherPicker({ voucher, menuData, canEdit = true, onSuccess, onAddItem, open = true, onChildOpenChange }: ScopedMenuVoucherPickerProps) {
  const powders = usePowderStore((state) => state.data);
  const pendingSuccess = useRef(false);
  const customerAddItem = useCartStore((state) => state.addItem);
  const addItem = onAddItem ?? customerAddItem;
  const [picked, setPicked] = useState<{ item: MenuItem; target: VoucherEligibleMenuItem } | null>(null);
  const menuItems = useMemo(
    () => [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])],
    [menuData],
  );
  const targets = voucher.eligible_menu_items ?? [];

  const confirm = (cartItem: CartItem) => {
    if (!canEdit || !picked) return;
    const { cartId: _cartId, ...withoutId } = cartItem;
    void _cartId;
    const result = addItem(withoutId);
    if (!result.ok) { toast.error(result.message); return; }
    pendingSuccess.current = true;
    return result;
  };

  const pickTarget = (target: VoucherEligibleMenuItem) => {
    if (!canEdit || !target.is_available) return;
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
    onChildOpenChange?.(true);
    setPicked({ item, target });
  };

  if (picked) {
    const { item, target } = picked;
    const size = target.size as Size | null | undefined;
    return <ProductModal managed open={open}
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
      onClose={() => { setPicked(null); onChildOpenChange?.(false); if (pendingSuccess.current) { pendingSuccess.current = false; onSuccess(); } }}
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
        if (!item) return <div key={target.menu_item_id} className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{target.name} · Không còn khả dụng</div>;
        const allowedSizes = target.size ? [target.size as Size] : undefined;
        return (
          <div key={target.menu_item_id} className={!canEdit ? "opacity-50" : undefined}>
            <MenuCard
              item={item}
              milkTypes={menuData.milk_types}
              compact
              disabled={!canEdit || !target.is_available || Boolean(target.size && !item.sizes.some((size) => size.size === target.size))}
              allowedSizes={allowedSizes}
              onItemClick={() => pickTarget(target)}
            />
            {target.size ? <p className="mt-1 text-xs text-muted-foreground">Size voucher: <SizeLabel size={target.size} /></p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {target.matcha_powder_id ? "Bột: " + (powders.find((entry) => entry.id === target.matcha_powder_id)?.name ?? "Theo cấu hình voucher") : ""}
              {target.milk_type_id ? " · Nền: " + (menuData.milk_types.find((entry) => entry.id === target.milk_type_id)?.name ?? "Theo cấu hình voucher") : ""}
              {!target.is_available ? " · Không còn khả dụng" : ""}
            </p>
          </div>
        );
      })}
    </section>
  );
}
