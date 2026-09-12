"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import ProductModal from "@/src/components/shared/ProductModal";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData, MenuItem, Size } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherEligibleMenuItem } from "@/src/services/customerVoucherService";
import { SizeLabel } from "@/src/components/ui/SizeLabel";

interface ScopedMenuVoucherPickerProps {
  voucher: MyVoucher;
  menuData: MenuData;
  /** Lock voucher edits while the wallet query is loading or revalidating. */
  canEdit?: boolean;
  onBack: () => void;
  onSuccess: () => void;
}

/** Lets a customer choose and configure exactly one scoped PRODUCT or ITEM reward. */
export function ScopedMenuVoucherPicker({ voucher, menuData, canEdit = true, onBack, onSuccess }: ScopedMenuVoucherPickerProps) {
  const { addItem, setCartOpen } = useCartStore();
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
    setCartOpen(true);
    onSuccess();
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
      setCartOpen(true);
      onSuccess();
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

  return <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="absolute inset-0 z-20 flex flex-col bg-background">
    <div className="flex items-center gap-3 border-b px-5 py-4"><button type="button" onClick={onBack} aria-label="Quay lại" className="grid h-11 w-11 place-items-center rounded-full bg-primary/5"><ArrowLeft className="h-5 w-5" /></button><h3 className="font-bold">Chọn một món được tặng</h3></div>
    <div className="flex-1 space-y-2 overflow-y-auto p-5">{targets.map((target) => <button key={target.menu_item_id} type="button" disabled={!canEdit} onClick={() => pickTarget(target)} className="min-h-14 w-full rounded-xl border bg-card px-4 text-left disabled:cursor-not-allowed disabled:opacity-50"><span className="block font-semibold">{target.name}</span>{target.size ? <span className="text-xs text-muted-foreground">Size <SizeLabel size={target.size} /></span> : <span className="text-xs text-muted-foreground">Món lẻ</span>}</button>)}</div>
  </motion.div>;
}
