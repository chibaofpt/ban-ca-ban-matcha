import type { MyVoucher } from "@/src/services/customerVoucherService";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";

/** Show the selected order-level discount preview and confirmation action. */
export function CartDiscountPickerFooter({ selectedVoucherIds, selectedDiscountVouchers, subtotalPrice, freeshipDiscount, onConfirm }: {
  selectedVoucherIds: string[]; selectedDiscountVouchers: MyVoucher[]; subtotalPrice: number;
  freeshipDiscount: number; onConfirm: () => void;
}) {
  if (selectedVoucherIds.length === 0) return null;
  const orderDiscount = estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice);
  return (
    <div className="z-10 shrink-0 border-t border-border/30 bg-white px-5 pb-5 pt-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex flex-col gap-1">
        {orderDiscount > 0 && <p className="flex items-center justify-between text-xs"><span className="font-medium text-primary/60">Giảm giá đơn hàng:</span><span className="font-bold text-orange-600">-{Math.floor(orderDiscount / 1000).toLocaleString("vi-VN")}k</span></p>}
        {freeshipDiscount > 0 && <p className="flex items-center justify-between text-xs"><span className="font-medium text-primary/60">Giảm phí ship:</span><span className="font-bold text-teal-600">-{Math.floor(freeshipDiscount / 1000).toLocaleString("vi-VN")}k</span></p>}
        <p className="flex items-center justify-between border-t border-dashed border-border/40 pt-2"><span className="text-sm font-bold text-primary">Tổng cộng ({selectedVoucherIds.length} mã):</span><span className="text-base font-bold text-red-500">-{Math.floor((orderDiscount + freeshipDiscount) / 1000).toLocaleString("vi-VN")}k</span></p>
      </div>
      <button onClick={onConfirm} className="min-h-11 w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-ring">Xác nhận</button>
    </div>
  );
}
