import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Ticket, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/src/utils/cn";
import { estimateProductSavings } from "@/src/utils/voucherMatchUtils";
import type { CartItem } from "@/src/lib/types/cart";
import type { MyVoucher } from "@/src/services/customerVoucherService";

interface CartItemVoucherPickerProps {
  activeItem: CartItem;
  items: CartItem[];
  applicableProductVouchers: Map<string, MyVoucher[]>;
  applicableAddonVouchersMap: Map<string, MyVoucher[]>;
  onClose: () => void;
  onApplyProductVoucher: (cartId: string, voucher: MyVoucher) => void;
  getProductVoucherSavings: (item: CartItem, voucher: MyVoucher) => number;
  onRemoveProductVoucher: (cartId: string) => void;
  onApplyAddonVoucher: (cartId: string, voucherId: string, addonOptionId: string) => void;
  onRemoveAddonVoucher: (cartId: string, voucherId: string) => void;
}

export const CartItemVoucherPicker = ({
  activeItem,
  items,
  applicableProductVouchers,
  applicableAddonVouchersMap,
  onClose,
  onApplyProductVoucher,
  getProductVoucherSavings,
  onRemoveProductVoucher,
  onApplyAddonVoucher,
  onRemoveAddonVoucher
}: CartItemVoucherPickerProps) => {
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

      <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-6">
        {/* Item info */}
        <div className="flex items-center gap-3 p-3 bg-white border border-border/40 rounded-2xl shadow-sm">
          <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-secondary/10 relative">
            {activeItem.imageUrl && (
              <Image src={activeItem.imageUrl} alt={activeItem.name} fill sizes="48px" className="object-cover" />
            )}
          </div>
          <div>
            <p className="font-bold text-sm text-primary">{activeItem.name}</p>
            <p className="text-[11px] text-primary/60">Size {activeItem.size}</p>
          </div>
        </div>

        {/* Product vouchers */}
        {(applicableProductVouchers.get(activeItem.menuItemId)?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-primary/50 uppercase tracking-widest">Miễn phí món</p>
            <div className="space-y-2">
              {applicableProductVouchers.get(activeItem.menuItemId)?.map(v => {
                const savings = v.voucher_type === "PRODUCT_DISCOUNT"
                  ? getProductVoucherSavings(activeItem, v)
                  : estimateProductSavings(v, activeItem.originalClientPriceVnd - activeItem.addonsPrice);
                const isSelected = activeItem.productVoucherId === v.qr_token;
                const isAlreadyUsed = items.some(c => c.cartId !== activeItem.cartId && c.productVoucherId === v.qr_token);
                
                return (
                  <button
                    key={v.qr_token}
                    disabled={isAlreadyUsed}
                    onClick={() => {
                      if (isAlreadyUsed) return;
                      if (isSelected) {
                        onRemoveProductVoucher(activeItem.cartId);
                      } else {
                        onApplyProductVoucher(activeItem.cartId, v);
                      }
                      onClose();
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
        {(applicableAddonVouchersMap.get(activeItem.cartId)?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-primary/50 uppercase tracking-widest">Free Topping</p>
            <div className="space-y-2">
                {applicableAddonVouchersMap.get(activeItem.cartId)?.map(v => {
                  const isSelected = activeItem.addonVouchers?.some(av => av.voucherId === v.qr_token);
                  const isAlreadyUsed = items.some(c => c.cartId !== activeItem.cartId && c.addonVouchers?.some(av => av.voucherId === v.qr_token));
                  
                  return (
                    <button
                      key={v.qr_token}
                      disabled={isAlreadyUsed}
                      onClick={() => {
                        if (isAlreadyUsed) return;
                        if (isSelected) {
                          onRemoveAddonVoucher(activeItem.cartId, v.qr_token);
                        } else {
                          onApplyAddonVoucher(activeItem.cartId, v.qr_token, v.addon_option_id!);
                        }
                        onClose();
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
                        Free {v.addonOption?.label || "Topping"}
                      </p>
                      {isAlreadyUsed && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">Đã dùng ở ly khác</p>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
