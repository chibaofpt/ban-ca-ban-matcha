import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Ticket, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/src/utils/cn";
import { estimateProductSavings, getAddonVoucherTargetChoices, getAppliedMenuVoucherId } from "@/src/utils/voucherMatchUtils";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import { toast } from "sonner";
import { SizeLabel } from "@/src/components/ui/SizeLabel";

interface CartItemVoucherPickerProps {
  activeItem: ProjectedCartLine;
  items: ProjectedCartLine[];
  applicableProductVouchers: Map<string, MyVoucher[]>;
  applicableAddonVouchersMap: Map<string, MyVoucher[]>;
  bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>;
  bundleAllocatedAddonQuantities: ReadonlyMap<string, number>;
  onClose: () => void;
  onApplyProductVoucher: (cartId: string, voucher: MyVoucher) => CartMutationResult;
  getProductVoucherSavings: (item: ProjectedCartLine, voucher: MyVoucher) => number;
  onRemoveProductVoucher: (cartId: string) => CartMutationResult;
  onApplyAddonVoucher: (cartId: string, voucherId: string, addonOptionId: string) => CartMutationResult;
  onRemoveAddonVoucher: (cartId: string, voucherId: string) => CartMutationResult;
}

export const CartItemVoucherPicker = ({
  activeItem,
  items,
  applicableProductVouchers,
  applicableAddonVouchersMap,
  bundleAllocatedQuantitiesByCartId,
  bundleAllocatedAddonQuantities,
  onClose,
  onApplyProductVoucher,
  getProductVoucherSavings,
  onRemoveProductVoucher,
  onApplyAddonVoucher,
  onRemoveAddonVoucher
}: CartItemVoucherPickerProps) => {
  const [addonChoiceVoucherId, setAddonChoiceVoucherId] = useState<string | null>(null);
  const closeAfterSuccess = (result: CartMutationResult) => {
    if (!result.ok) { toast.error(result.message); return; }
    onClose();
  };
  const hasOutsideUnit = (bundleAllocatedQuantitiesByCartId.get(activeItem.cartId) ?? 0) < activeItem.quantity;
  const addonChoicesFor = (voucher: MyVoucher) => getAddonVoucherTargetChoices(
    voucher,
    activeItem.configuration.size === null ? [] : activeItem.configuration.addonOptionIds,
    activeItem.addonVouchers.map((entry) => entry.addonOptionId),
    Object.fromEntries(activeItem.resolvedAddons.map((addon) => [addon.id, addon.priceVnd])),
  ).filter((choice) =>
    (bundleAllocatedAddonQuantities.get(`${activeItem.cartId}:${choice.addonOptionId}`) ?? 0) < activeItem.quantity,
  );
  const addonVouchersForItem = (applicableAddonVouchersMap.get(activeItem.cartId) ?? []).filter((voucher) =>
    activeItem.addonVouchers.some((entry) => entry.token === voucher.qr_token)
    || (hasOutsideUnit && addonChoicesFor(voucher).length > 0),
  );
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-0 z-10 bg-[#fdfcf7] flex flex-col"
    >
      {/* Overlay header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-white">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-primary" />
        </button>
        <h3 className="font-bold text-primary">Ưu đãi cho món này</h3>
      </div>

      <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-5 space-y-6">
        {/* Item info */}
        <div className="flex items-center gap-3 p-3 bg-white border border-border/40 rounded-2xl shadow-sm">
          <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-secondary/10 relative">
            {activeItem.imageUrl && (
              <Image src={activeItem.imageUrl} alt={activeItem.name} fill sizes="48px" className="object-cover" />
            )}
          </div>
          <div>
            <p className="font-bold text-sm text-primary">{activeItem.name}</p>
            <p className="text-[11px] text-primary/60">Size <SizeLabel size={activeItem.configuration.size} /></p>
          </div>
        </div>

        {/* Product vouchers */}
        {hasOutsideUnit && (applicableProductVouchers.get(activeItem.menuItemId)?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-primary/50 uppercase tracking-widest">Miễn phí món</p>
            <div className="space-y-2">
              {applicableProductVouchers.get(activeItem.menuItemId)?.map(v => {
                const savings = v.voucher_type === "PRODUCT_DISCOUNT"
                  ? getProductVoucherSavings(activeItem, v)
                  : estimateProductSavings(
                    v,
                    activeItem.drinkPriceVnd,
                    activeItem.menuItemId,
                  );
                const isSelected = getAppliedMenuVoucherId(activeItem) === v.qr_token;
                const isAlreadyUsed = items.some(c => c.cartId !== activeItem.cartId && getAppliedMenuVoucherId(c) === v.qr_token);
                
                return (
                  <button
                    key={v.qr_token}
                    disabled={isAlreadyUsed}
                    onClick={() => {
                      if (isAlreadyUsed) return;
                      if (isSelected) {
                        closeAfterSuccess(onRemoveProductVoucher(activeItem.cartId));
                      } else {
                        closeAfterSuccess(onApplyProductVoucher(activeItem.cartId, v));
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors",
                      isSelected
                        ? "bg-orange-50 border-orange-200"
                        : isAlreadyUsed
                        ? "opacity-40 bg-secondary/30 border-transparent cursor-not-allowed"
                        : "bg-white border-border hover:bg-orange-50/50 hover:border-orange-100"
                    )}
                  >
                    <div>
                      <p className="font-bold text-sm text-primary flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-orange-500" /> {v.package.name}
                      </p>
                      {savings > 0 && !isAlreadyUsed && (
                        <p className="text-xs text-orange-600 mt-1">
                          Giảm {(savings / 1000).toLocaleString('vi-VN')} ká
                        </p>
                      )}
                      {isAlreadyUsed && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">Đã dùng ở ly khác</p>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Addon vouchers */}
        {addonVouchersForItem.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-primary/50 uppercase tracking-widest">Free Topping</p>
            <div className="space-y-2">
                {addonVouchersForItem.map(v => {
                  const addonPrices = Object.fromEntries(activeItem.resolvedAddons.map((addon) => [addon.id, addon.priceVnd]));
                  const appliedVoucher = activeItem.addonVouchers.find(av => av.token === v.qr_token);
                  const choices = appliedVoucher
                    ? getAddonVoucherTargetChoices(v, [appliedVoucher.addonOptionId], [], addonPrices)
                    : addonChoicesFor(v);
                  const isSelected = appliedVoucher !== undefined;
                  const isAlreadyUsed = items.some(c => c.cartId !== activeItem.cartId && c.addonVouchers.some(av => av.token === v.qr_token));
                  
                  return (
                    <div key={v.qr_token} className="space-y-2">
                    <button
                      disabled={isAlreadyUsed}
                      onClick={() => {
                        if (isAlreadyUsed) return;
                        if (isSelected) {
                          closeAfterSuccess(onRemoveAddonVoucher(activeItem.cartId, v.qr_token));
                        } else {
                          if (choices.length === 1) {
                            closeAfterSuccess(onApplyAddonVoucher(activeItem.cartId, v.qr_token, choices[0].addonOptionId));
                          } else if (choices.length > 1) {
                            setAddonChoiceVoucherId(v.qr_token);
                          }
                        }
                      }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors",
                      isSelected
                        ? "bg-green-50 border-green-200"
                        : isAlreadyUsed
                        ? "opacity-40 bg-secondary/30 border-transparent cursor-not-allowed"
                        : "bg-white border-border hover:bg-green-50/50 hover:border-green-100"
                    )}
                  >
                    <div>
                      <p className="font-bold text-sm text-primary flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-green-600" /> {v.package.name}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        {choices.length > 1 ? `Chọn 1 trong ${choices.length} topping` : `Free ${choices[0]?.label ?? v.addonOption?.label ?? "Topping"}`}
                      </p>
                      {isAlreadyUsed && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">Đã dùng ở ly khác</p>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />}
                  </button>
                  {!isSelected && addonChoiceVoucherId === v.qr_token ? (
                    <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/60 p-2" role="group" aria-label="Chọn topping được giảm">
                      {choices.map((choice) => (
                        <button
                          type="button"
                          key={choice.addonOptionId}
                          onClick={() => {
                            closeAfterSuccess(onApplyAddonVoucher(activeItem.cartId, v.qr_token, choice.addonOptionId));
                          }}
                          className="flex min-h-11 w-full items-center justify-between rounded-lg bg-white px-3 text-left text-sm font-semibold"
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
    </motion.div>
  );
};
