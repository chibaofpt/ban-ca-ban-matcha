import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Coins } from "lucide-react";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import { exchangeVoucher, type MyVoucher, type VoucherPackage } from "@/src/services/customerVoucherService";
import { useQueryClient } from "@tanstack/react-query";
import { VoucherCard, PackageCard } from "@/src/components/shared/VoucherCards";
import { CartBundleVoucherPanel } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import type { CartItem } from "@/src/lib/types/cart";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";

interface CartDiscountPickerProps {
  discountVouchers: MyVoucher[];
  freeshipVouchers: MyVoucher[];
  availableVoucherPackages: VoucherPackage[];
  pointsBalance: number;
  selectedVoucherIds: string[];
  selectedDiscountVouchers: MyVoucher[];
  selectedFreeshipVouchers: MyVoucher[];
  subtotalPrice: number;
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
  onClose: () => void;
  onUpdateSelectedVouchers: React.Dispatch<React.SetStateAction<string[]>>;
  onRefreshVouchers: () => void;
  bundleVouchers: MyVoucher[];
  cart: CartItem[];
  addonLabels: ReadonlyMap<string, string>;
  selectedBundleToken: string | null;
  bundleAllocations: BundleSelectionAllocation[];
  onBundleVoucherChange: (token: string | null) => void;
  onBundleAllocationsChange: (allocations: BundleSelectionAllocation[]) => void;
}

export const CartDiscountPicker = ({
  discountVouchers,
  freeshipVouchers,
  availableVoucherPackages,
  pointsBalance,
  selectedVoucherIds,
  selectedDiscountVouchers,
  selectedFreeshipVouchers,
  subtotalPrice,
  orderType,
  shippingFee,
  onClose,
  onUpdateSelectedVouchers,
  onRefreshVouchers,
  bundleVouchers,
  cart,
  addonLabels,
  selectedBundleToken,
  bundleAllocations,
  onBundleVoucherChange,
  onBundleAllocationsChange,
}: CartDiscountPickerProps) => {
  const [isRedeeming, setIsRedeeming] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const myVouchers = [...discountVouchers, ...freeshipVouchers];

  const handleRedeem = async (packageId: string) => {
    try {
      setIsRedeeming(packageId);
      const newVoucher = await exchangeVoucher(packageId);
      onUpdateSelectedVouchers(prev => [...prev, newVoucher.qr_token]);
      onRefreshVouchers();
      queryClient.invalidateQueries({ queryKey: ["customer", "points"] }); // refresh points
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
      alert("Đổi điểm thất bại: " + message);
    } finally {
      setIsRedeeming(null);
    }
  };

  const selectedOrderDiscount = estimateMultiDiscountSavings(
    selectedDiscountVouchers,
    subtotalPrice
  );
  const selectedFreeshipVoucher = selectedFreeshipVouchers[0] ?? null;
  const totalAfterSelectedDiscount = subtotalPrice - selectedOrderDiscount;
  const selectedFreeshipDiscount =
    orderType === "DELIVERY" &&
    selectedFreeshipVoucher &&
    (selectedFreeshipVoucher.min_order_vnd === null ||
      totalAfterSelectedDiscount >= selectedFreeshipVoucher.min_order_vnd)
      ? Math.min(
          shippingFee ?? 0,
          selectedFreeshipVoucher.covered_delivery_fee_vnd ?? 0
        )
      : 0;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-0 z-10 bg-[#f4f4f5] flex flex-col"
    >
      {/* Overlay header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0 bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-primary" />
          </button>
          <div>
            <h3 className="font-bold text-primary leading-tight">Mã ưu đãi</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <Coins className="w-3 h-3 text-orange-500" />
              <p className="text-[11px] font-medium text-orange-600">Bạn đang có: {pointsBalance} điểm</p>
            </div>
          </div>
        </div>
        {selectedVoucherIds.length > 0 && (
          <button
            onClick={() => onUpdateSelectedVouchers([])}
            className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors shrink-0"
          >
            Bỏ tất cả
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6">
        <CartBundleVoucherPanel
          vouchers={bundleVouchers}
          cart={cart}
          addonLabels={addonLabels}
          selectedVoucherToken={selectedBundleToken}
          allocations={bundleAllocations}
          onVoucherChange={onBundleVoucherChange}
          onAllocationsChange={onBundleAllocationsChange}
        />
        
        {/* Section 1: Ưu đãi của bạn */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-primary text-sm">Ưu đãi của bạn</h4>
            <span className="text-[10px] text-primary/50">Tối đa 1 mã %, 1 freeship</span>
          </div>
          
          {myVouchers.length === 0 ? (
            <div className="text-center py-6 bg-white rounded-2xl border border-dashed border-border/60">
              <p className="text-xs text-primary/40 font-medium">Bạn chưa có mã ưu đãi nào</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {myVouchers.map((v) => {
                const isSelected = selectedVoucherIds.includes(v.qr_token);
                const selectedOrderDiscount = selectedDiscountVouchers;
                const currentOrderDiscount = estimateMultiDiscountSavings(
                  selectedOrderDiscount,
                  subtotalPrice
                );
                const candidateOrderDiscount = v.voucher_type === "DISCOUNT"
                  ? estimateMultiDiscountSavings(
                      v.discount_type === "PERCENT"
                        ? [
                            ...selectedOrderDiscount.filter(
                              (selected) => selected.discount_type !== "PERCENT"
                            ),
                            v,
                          ]
                        : [...selectedOrderDiscount, v],
                      subtotalPrice
                    )
                  : currentOrderDiscount;
                const amountBeforeShipping = subtotalPrice - currentOrderDiscount;

                let isDisabled = false;
                let disabledReason = "";
                if (!isSelected && v.voucher_type === "DISCOUNT") {
                  if (v.min_order_vnd !== null && subtotalPrice < v.min_order_vnd) {
                    isDisabled = true;
                    disabledReason = "Chưa đạt giá trị đơn tối thiểu";
                  } else if (candidateOrderDiscount <= currentOrderDiscount) {
                    isDisabled = true;
                    disabledReason = "Voucher không tạo thêm ưu đãi cho đơn này";
                  }
                }
                if (!isSelected && v.voucher_type === "FREESHIP") {
                  if (orderType !== "DELIVERY" || (shippingFee ?? 0) <= 0) {
                    isDisabled = true;
                    disabledReason = "Chỉ áp dụng khi đơn giao hàng có phí ship";
                  } else if (
                    v.min_order_vnd !== null &&
                    amountBeforeShipping < v.min_order_vnd
                  ) {
                    isDisabled = true;
                    disabledReason = "Chưa đạt giá trị đơn tối thiểu sau giảm giá";
                  } else if ((v.covered_delivery_fee_vnd ?? 0) <= 0) {
                    isDisabled = true;
                    disabledReason = "Voucher không tạo thêm ưu đãi cho đơn này";
                  }
                }

                return (
                  <VoucherCard 
                    key={v.qr_token}
                    voucher={v} 
                    isDisabled={isDisabled}
                    disabledReason={disabledReason}
                    isSelected={isSelected}
                    onClick={() => {
                      onUpdateSelectedVouchers((prev: string[]) => {
                        if (isSelected) {
                          return prev.filter((id) => id !== v.qr_token);
                        }
                        let newSelected = [...prev];
                        if (v.voucher_type === "DISCOUNT" && v.discount_type === "PERCENT") {
                          newSelected = newSelected.filter(id => {
                            const existingV = discountVouchers.find(d => d.qr_token === id);
                            return !(existingV && existingV.discount_type === "PERCENT");
                          });
                        }
                        if (v.voucher_type === "FREESHIP") {
                          newSelected = newSelected.filter(id => !freeshipVouchers.find(f => f.qr_token === id));
                        }
                        return [...newSelected, v.qr_token];
                      });
                    }}
                    actionNode={
                      isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 ml-2" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-border/60 shrink-0 ml-2" />
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Đổi điểm lấy ưu đãi */}
        {availableVoucherPackages.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="font-bold text-primary text-sm">Đổi điểm lấy ưu đãi</h4>
              <span className="bg-yellow-100 text-yellow-800 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">Mới</span>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {availableVoucherPackages.map((p) => (
                <PackageCard 
                  key={p.id}
                  pkg={p}
                  userBalance={pointsBalance}
                  onExchange={() => handleRedeem(p.id)}
                  isExchanging={isRedeeming === p.id}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Preview total discount while overlay open */}
      {selectedVoucherIds.length > 0 && (
        <div className="px-5 pb-5 pt-4 border-t border-border/30 bg-white shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.06)] z-10">
          <div className="flex flex-col gap-1 mb-3">
            {selectedDiscountVouchers.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary/60">Giảm giá đơn hàng:</span>
                <span className="text-xs font-bold text-orange-600">
                  -{Math.floor(estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice) / 1000).toLocaleString('vi-VN')}k
                </span>
              </div>
            )}
            {selectedFreeshipDiscount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary/60">Giảm phí ship:</span>
                <span className="text-xs font-bold text-teal-600">
                  -{Math.floor(selectedFreeshipDiscount / 1000).toLocaleString('vi-VN')}k
                </span>
              </div>
            )}
            {selectedVoucherIds.length > 1 && <div className="border-t border-dashed border-border/40 my-1" />}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary">Tổng cộng ({selectedVoucherIds.length} mã):</span>
              <span className="text-base font-bold text-red-500">
                -{Math.floor((selectedOrderDiscount + selectedFreeshipDiscount) / 1000).toLocaleString('vi-VN')}k
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-bold text-sm hover:scale-[1.01] active:scale-[0.99] transition-all flex justify-center items-center"
          >
            Xác nhận
          </button>
        </div>
      )}
    </motion.div>
  );
};
