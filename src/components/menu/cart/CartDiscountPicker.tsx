import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/src/utils/cn";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import type { MyVoucher } from "@/src/services/customerVoucherService";

interface CartDiscountPickerProps {
  discountVouchers: MyVoucher[];
  freeshipVouchers: MyVoucher[];
  selectedVoucherIds: string[];
  selectedDiscountVouchers: MyVoucher[];
  selectedFreeshipVouchers: MyVoucher[];
  subtotalPrice: number;
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
  onClose: () => void;
  onUpdateSelectedVouchers: React.Dispatch<React.SetStateAction<string[]>>;
}

export const CartDiscountPicker = ({
  discountVouchers,
  freeshipVouchers,
  selectedVoucherIds,
  selectedDiscountVouchers,
  selectedFreeshipVouchers,
  subtotalPrice,
  orderType,
  shippingFee,
  onClose,
  onUpdateSelectedVouchers
}: CartDiscountPickerProps) => {
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-0 z-10 bg-[#fdfcf7] flex flex-col"
    >
      {/* Overlay header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-primary" />
          </button>
          <div>
            <h3 className="font-bold text-primary">Ưu đãi toàn đơn</h3>
            <p className="text-[11px] text-primary/50">Tối đa 1 mã % giảm, 1 mã freeship</p>
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

      <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-3">
        {[...discountVouchers, ...freeshipVouchers].map((v) => {
          const isSelected = selectedVoucherIds.includes(v.id);
          const hasSelectedPercent = selectedVoucherIds.some(id => discountVouchers.find(d => d.id === id)?.discount_type === "PERCENT");
          const hasSelectedFreeship = selectedVoucherIds.some(id => freeshipVouchers.find(f => f.id === id));
          
          let isDisabled = false;
          let disabledReason = "";
          
          if (!isSelected) {
            if (v.voucher_type === "DISCOUNT" && v.discount_type === "PERCENT" && hasSelectedPercent) {
              isDisabled = true;
              disabledReason = "Đã chọn 1 mã giảm %";
            } else if (v.voucher_type === "FREESHIP" && hasSelectedFreeship) {
              isDisabled = true;
              disabledReason = "Đã chọn 1 mã freeship";
            }
          }

          const label = v.voucher_type === "FREESHIP"
            ? `Giảm ${(v.covered_delivery_fee_vnd ?? 0).toLocaleString("vi-VN")}đ phí ship`
            : v.discount_type === "PERCENT"
              ? `Giảm ${v.discount_value}% toàn đơn`
              : `Giảm ${(v.discount_value ?? 0).toLocaleString("vi-VN")}đ toàn đơn`;

          return (
            <button
              key={v.id}
              disabled={isDisabled}
              onClick={() => {
                onUpdateSelectedVouchers((prev: string[]) =>
                  isSelected
                    ? prev.filter((id) => id !== v.id)
                    : [...prev, v.id]
                );
              }}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-colors shadow-sm",
                isSelected && "bg-orange-50 border-orange-200",
                !isSelected && !isDisabled && "bg-white border-border/60 hover:border-orange-200",
                isDisabled && "bg-white border-border/30 opacity-40 cursor-not-allowed"
              )}
            >
              <div>
                <p className="font-bold text-sm text-primary">{v.package.name}</p>
                <p className="text-xs text-orange-600 mt-1 font-medium">{label}</p>
                {isDisabled && (
                  <p className="text-[10px] text-primary/40 mt-0.5">{disabledReason}</p>
                )}
              </div>
              {isSelected && <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Preview total discount while overlay open */}
      {selectedVoucherIds.length > 0 && (
        <div className="px-5 pb-5 pt-3 border-t border-border/30 bg-white shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary/60">Tổng ưu đãi ({selectedVoucherIds.length} mã)</span>
            <span className="text-sm font-bold text-orange-600">
              -{Math.floor((estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice) + (orderType === "DELIVERY" ? Math.min(shippingFee ?? 0, selectedFreeshipVouchers[0]?.covered_delivery_fee_vnd ?? 0) : 0)) / 1000).toLocaleString('vi-VN')} ká
            </span>
          </div>
          <button
            onClick={onClose}
            className="mt-3 w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            Xác nhận
          </button>
        </div>
      )}
    </motion.div>
  );
};
