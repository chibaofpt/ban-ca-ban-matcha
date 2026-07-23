"use client";

import { Drawer } from "vaul";
import { Fish, Info, X } from "lucide-react";
import { formatKa } from "@/src/utils/display";

interface PointsBreakdownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eligibleMerchandiseVnd: number;
  orderPoints: number;
  surplusPoints: number;
  totalPoints: number;
}

/** Explains the checkout loyalty estimate without making the cart footer taller. */
export function PointsBreakdownSheet({
  open,
  onOpenChange,
  eligibleMerchandiseVnd,
  orderPoints,
  surplusPoints,
  totalPoints,
}: PointsBreakdownSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[140] bg-black/45" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[141] mx-auto max-w-lg rounded-t-[2rem] bg-[#fdfcf7] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl outline-none">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-primary/20" />
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <Drawer.Title className="font-serif text-xl font-bold text-primary">
                Cách tính điểm
              </Drawer.Title>
              <Drawer.Description className="mt-1 text-sm text-primary/65">
                Điểm được cộng khi đơn hàng hoàn tất.
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-3 rounded-2xl border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-primary/70">Tiền hàng tính điểm</span>
              <span className="font-bold text-primary">
                {formatKa(eligibleMerchandiseVnd, "floor")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-primary/70">Điểm mua hàng</span>
              <span className="font-bold text-primary">+{orderPoints}</span>
            </div>
            {surplusPoints > 0 && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-primary/70">Điểm dư từ voucher</span>
                <span className="font-bold text-amber-700">+{surplusPoints}</span>
              </div>
            )}
            <div className="border-t border-dashed border-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-bold text-primary">
                  <Fish className="h-4 w-4" />
                  Bạn sẽ nhận
                </span>
                <span className="font-serif text-2xl font-bold text-primary">
                  +{totalPoints} điểm
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-relaxed text-sky-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Phí giao hàng không được tính vào điểm mua hàng. Điểm dư voucher được cộng VND
            trên toàn đơn rồi mới quy đổi một lần.
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
