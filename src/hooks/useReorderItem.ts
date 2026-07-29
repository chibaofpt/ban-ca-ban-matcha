"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCartStore } from "@/src/lib/store/cartStore";
import type {
  HistoryOrderItem,
  ReorderWarning,
} from "@/src/lib/types/reorder";
import {
  buildReorderItem,
  getReorderVoucherEligibleAddonIds,
} from "@/src/utils/reorderHelper";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import { listMyVouchers } from "@/src/services/customerVoucherService";

interface ReorderResultState {
  isOpen: boolean;
  itemName: string;
  configSummary: string[];
  warnings: ReorderWarning[];
  isSuccess: boolean;
}

const initialResult: ReorderResultState = {
  isOpen: false,
  itemName: "",
  configSummary: [],
  warnings: [],
  isSuccess: false,
};

/** Coordinate current-menu validation, cart insertion, and voucher matching for reorder. */
export function useReorderItem() {
  const [result, setResult] = useState<ReorderResultState>(initialResult);
  const addItem = useCartStore((state) => state.addItem);
  const applyProductVoucher = useCartStore(
    (state) => state.applyProductVoucher,
  );
  const applyAddonVoucher = useCartStore((state) => state.applyAddonVoucher);
  const setCartOpen = useCartStore((state) => state.setCartOpen);
  const router = useRouter();

  const reorderItem = async (item: HistoryOrderItem): Promise<void> => {
    const loadingToast = toast.loading("Đang kiểm tra món...");
    try {
      const [menuData, powderData] = await Promise.all([
        fetchMenu(),
        fetchPowders(),
      ]);
      const resolved = buildReorderItem(item, menuData, powderData);
      const cartItem = resolved.cartItem;

      if (!cartItem) {
        setResult({
          isOpen: true,
          itemName: item.menuItem.name,
          configSummary: resolved.configSummary,
          warnings: resolved.warnings,
          isSuccess: false,
        });
        return;
      }

      const cartId = addItem(cartItem);
      try {
        const activeVouchers = (await listMyVouchers()).filter(
          (voucher) => voucher.status === "ACTIVE",
        );
        const productVoucher = activeVouchers.find(
          (voucher) =>
            voucher.voucher_type === "PRODUCT" &&
            voucher.menu_item_id === cartItem.menuItemId,
        );
        if (productVoucher?.covered_price_vnd) {
          applyProductVoucher(
            cartId,
            productVoucher.id,
            productVoucher.covered_price_vnd,
          );
        }

        const addonIds = getReorderVoucherEligibleAddonIds(menuData, cartItem);
        const usedOptions = new Set<string>();
        for (const voucher of activeVouchers) {
          const optionId = voucher.addon_option_id;
          if (
            voucher.voucher_type === "ADDON" &&
            optionId &&
            addonIds.includes(optionId) &&
            !usedOptions.has(optionId)
          ) {
            applyAddonVoucher(cartId, voucher.id, optionId);
            usedOptions.add(optionId);
          }
        }
      } catch (error: unknown) {
        console.error("Voucher auto-apply failed", error);
      }

      setResult({
        isOpen: true,
        itemName: cartItem.name,
        configSummary: resolved.configSummary,
        warnings: resolved.warnings,
        isSuccess: true,
      });
    } catch {
      toast.error("Có lỗi xảy ra khi kiểm tra món");
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const closeResult = () =>
    setResult((current) => ({ ...current, isOpen: false }));

  const openCart = () => {
    closeResult();
    router.push("/menu");
    setCartOpen(true);
  };

  return { result, reorderItem, closeResult, openCart };
}
