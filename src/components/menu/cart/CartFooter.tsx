"use client";

import React, { memo } from "react";
import { motion, type PanInfo } from "framer-motion";
import { Ticket, MapPin, ShoppingBag, Info } from "lucide-react";
import { CartMoney } from "@/src/components/shared/CartMoney";
import { cn } from "@/src/utils/cn";
import type { Address } from "@/src/lib/types/address";
import type { PriceConflict } from "@/src/services/orderService";
import { PointsBreakdownSheet } from "./PointsBreakdownSheet";

type CheckoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "price_changed"; conflicts: PriceConflict[] }
  | { status: "error"; message: string };

interface CartFooterProps {
  itemsLength: number;
  isLoggedIn: boolean;
  openLogin: () => void;
  openVoucherLogin: () => void;
  isStoreClosed: boolean;
  closure_note: string | null;
  orderType: "PICKUP" | "DELIVERY";
  setOrderType: (type: "PICKUP" | "DELIVERY") => void;
  pickupTime: string;
  setPickupTime: (time: string) => void;
  minTimeStr: string;
  pickupTimeUnavailableToday: boolean;
  setIsTimeCustom: (custom: boolean) => void;
  handleToggleDragEnd: (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => void;
  
  // Delivery State
  isFetchingAddress: boolean;
  deliveryAddress: Address | null;
  deliveryDistanceKm: number | null;
  deliveryError: string | null;
  shippingFee: number | null;
  setIsAddressPickerOpen: (open: boolean) => void;
  setIsDiscountPickerOpen: (open: boolean) => void;

  // Voucher / Pricing state
  subtotalVnd: number;
  shippingVnd: number;
  totalDiscountVnd: number;
  voucherRevalidating: boolean;
  grandTotalVnd: number;
  totalAfterDiscountVnd: number;
  hasUnavailableItems: boolean;
  checkoutBlocked: boolean;
  checkoutBlockMessage: string | null;
  orderPoints: number;
  surplusPoints: number;
  totalPoints: number;

  checkout: CheckoutState;
  handleCheckout: () => void;
}

export const CartFooter = memo(function CartFooter({
  itemsLength,
  isLoggedIn,
  openLogin,
  openVoucherLogin,
  isStoreClosed,
  closure_note,
  orderType,
  setOrderType,
  pickupTime,
  setPickupTime,
  minTimeStr,
  pickupTimeUnavailableToday,
  setIsTimeCustom,
  handleToggleDragEnd,
  isFetchingAddress,
  deliveryAddress,
  deliveryDistanceKm,
  deliveryError,
  shippingFee,
  setIsAddressPickerOpen,
  setIsDiscountPickerOpen,
  totalDiscountVnd,
  voucherRevalidating,
  grandTotalVnd,
  totalAfterDiscountVnd,
  hasUnavailableItems,
  checkoutBlocked,
  checkoutBlockMessage,
  orderPoints,
  surplusPoints,
  totalPoints,
  checkout,
  handleCheckout,
}: CartFooterProps) {
  const [isPointsSheetOpen, setIsPointsSheetOpen] = React.useState(false);
  if (itemsLength === 0) return null;

  return (
    <div className="border-t border-border/40 bg-white px-4 pb-2 pt-2.5 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.06)] space-y-2 flex flex-col touch-none">


      {/* Store closed notice */}
      {isStoreClosed && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <span className="text-base leading-none mt-0.5 shrink-0">😴</span>
          <span className="text-xs font-medium text-amber-800 leading-snug flex-1">
            {closure_note
              ? `Cửa hàng tạm đóng: ${closure_note}`
              : "Cửa hàng hiện đang đóng cửa, chưa thể đặt hàng"}
          </span>
        </div>
      )}

      {checkoutBlocked && checkoutBlockMessage && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="text-xs font-medium leading-snug text-amber-800">{checkoutBlockMessage}</span>
        </div>
      )}

      {/* Row 1: Order Type Toggle (2/3) + Giờ nhận (1/3) */}
      <div className="flex gap-2 items-stretch">
        <motion.div 
          className="relative flex bg-secondary/10 p-1 rounded-xl" style={{ width: "66.67%" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleToggleDragEnd}
        >
          <div 
            className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] bg-[#2d4a22] rounded-lg shadow-sm transition-transform duration-300 ease-out z-0"
            style={{ transform: orderType === "PICKUP" ? "translateX(0)" : "translateX(100%)" }}
          />
          <button
            type="button"
            onClick={() => setOrderType("PICKUP")}
            aria-pressed={orderType === "PICKUP"}
            className={cn(
              "relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors duration-300",
              orderType === "PICKUP" ? "text-white" : "text-primary/50 hover:text-primary/70"
            )}
          >
            Đến lấy
          </button>
          <button
            type="button"
            onClick={() => setOrderType("DELIVERY")}
            aria-pressed={orderType === "DELIVERY"}
            className={cn(
              "relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors duration-300",
              orderType === "DELIVERY" ? "text-white" : "text-primary/50 hover:text-primary/70"
            )}
          >
            Giao hàng
          </button>
        </motion.div>

        <div className="flex flex-col gap-0.5" style={{ width: "33.33%" }}>
          <div className="flex items-center justify-between bg-secondary/10 rounded-xl px-2 py-1.5 h-full">
            <div className="flex items-center gap-1">
              <label htmlFor="cart-pickup-time" className="text-[10px] font-bold text-primary leading-tight">Giờ</label>
            </div>
            <input
              id="cart-pickup-time"
              type="time"
              min={minTimeStr}
              value={pickupTime}
              onClick={() => {
                if (!pickupTime) {
                  setPickupTime(minTimeStr);
                  setIsTimeCustom(true);
                }
              }}
              onChange={(e) => {
                setPickupTime(e.target.value);
                setIsTimeCustom(true);
              }}
              onBlur={() => window.scrollTo(0, 0)}
              className={cn(
                "bg-transparent text-xs font-bold focus:outline-none w-16 text-right cursor-pointer",
                pickupTimeUnavailableToday || (pickupTime && pickupTime < minTimeStr) ? "text-red-500" : "text-primary"
              )}
              disabled={pickupTimeUnavailableToday}
            />
          </div>
          {(pickupTimeUnavailableToday || (pickupTime && pickupTime < minTimeStr)) && (
            <span className="text-[10px] text-red-600 font-semibold text-right leading-tight">
              {pickupTimeUnavailableToday ? "Hôm nay đã hết giờ nhận món" : "Vui lòng đặt trước ít nhất 10 phút"}
            </span>
          )}
        </div>
      </div>

      {/* Controls and payment summary in an equal-width layout */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div 
          className="flex min-w-0 flex-col gap-2 touch-pan-y"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleToggleDragEnd}
        >
          {/* Apply Voucher trigger */}
          <button
            onClick={() => {
              if (isLoggedIn) {
                setIsDiscountPickerOpen(true);
              } else {
                openVoucherLogin();
              }
            }}
            className="flex min-w-0 w-full shrink-0 items-center rounded-lg bg-[#e4a132] bg-[linear-gradient(135deg,#e4a132,#f1be60)] px-2 py-2 text-left text-white transition-colors hover:bg-[linear-gradient(135deg,#d99529,#e9b354)] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-white/10 p-1 rounded-md text-white shrink-0">
                <Ticket size={13} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white leading-tight [-webkit-text-stroke:0.3px_rgba(0,0,0,0.25)] [paint-order:stroke_fill]">Voucher</p>
                <p className="text-xs font-normal text-white leading-tight truncate [-webkit-text-stroke:0.3px_rgba(0,0,0,0.25)] [paint-order:stroke_fill]">
                  {!isLoggedIn
                    ? "Đăng nhập để xem ưu đãi"
                    : voucherRevalidating
                      ? "Đang xác minh ưu đãi đã chọn…"
                    : totalDiscountVnd > 0
                      ? <>Giảm <CartMoney amountVnd={totalDiscountVnd} /></>
                      : "Chọn voucher"}
                </p>
              </div>
            </div>
          </button>

          {/* Delivery address trigger (only when DELIVERY) */}
          {orderType === "DELIVERY" && (
            <div className="min-w-0">
              <button
                onClick={() => {
                  if (!isLoggedIn) {
                    openLogin();
                  } else {
                    setIsAddressPickerOpen(true);
                  }
                }}
                className="flex w-full items-center rounded-lg bg-[#c9799f] bg-[linear-gradient(135deg,#c9799f,#dda0be)] px-2 py-2 text-left text-white transition-colors hover:bg-[linear-gradient(135deg,#be6d93,#d494b2)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="bg-white/10 p-1 rounded-md text-white shrink-0">
                    <MapPin size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white leading-tight [-webkit-text-stroke:0.3px_rgba(0,0,0,0.25)] [paint-order:stroke_fill]">Địa chỉ</p>
                    <p className="text-xs font-normal text-white leading-tight truncate [-webkit-text-stroke:0.3px_rgba(0,0,0,0.25)] [paint-order:stroke_fill]">
                      {isFetchingAddress 
                        ? "Đang tải địa chỉ..." 
                        : deliveryAddress 
                          ? `${deliveryAddress.label || deliveryAddress.full_address}${deliveryDistanceKm !== null ? ` - ${deliveryDistanceKm.toFixed(1)}km` : ""}`
                          : "Chọn địa chỉ giao hàng"}
                    </p>
                  </div>
                </div>
              </button>
              {deliveryError && (
                <p className="px-1 text-[11px] text-red-500 font-medium">{deliveryError}</p>
              )}
            </div>
          )}
        </motion.div>

        <div className="flex min-w-0 flex-col items-end gap-2 text-right">
          <div className="flex w-full flex-col gap-1">
            <span className="text-left text-xs font-semibold text-muted-foreground">Tổng</span>
            <span className="inline-flex w-full flex-wrap items-baseline justify-end gap-1 font-serif text-xl font-bold text-primary">
              <span className="whitespace-nowrap"><CartMoney amountVnd={grandTotalVnd} /></span>
              {isLoggedIn && totalPoints > 0 && (
                <button
                  type="button"
                  onClick={() => setIsPointsSheetOpen(true)}
                  className="relative flex min-h-5 max-w-full flex-wrap items-center justify-end gap-1 rounded-md bg-teal-50 px-1.5 font-sans text-[10px] font-bold text-teal-800 after:absolute after:-inset-y-3 after:inset-x-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                  aria-label="Xem cách tính điểm"
                >
                  (+{totalPoints} điểm)
                  {surplusPoints > 0 && <span className="text-amber-700">· Có điểm dư</span>}
                  <Info className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
          {totalDiscountVnd > 0 ? (
            <p className="text-right text-[10px] font-semibold text-red-700">
              Được giảm <CartMoney amountVnd={totalDiscountVnd} />
            </p>
          ) : null}
          <button
            id="btn-checkout"
            onClick={handleCheckout}
            disabled={
              checkout.status === "loading" ||
              itemsLength === 0 ||
              pickupTimeUnavailableToday ||
              (!!pickupTime && pickupTime < minTimeStr) ||
              hasUnavailableItems ||
              checkoutBlocked ||
              isStoreClosed ||
              (orderType === "DELIVERY" && (!deliveryAddress || shippingFee === null || !!deliveryError))
            }
            className={cn(
              "mt-auto flex min-h-10 min-w-0 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg py-2 font-bold text-sm shadow-sm transition-all",
              checkout.status === "loading" || pickupTimeUnavailableToday || (!!pickupTime && pickupTime < minTimeStr) || hasUnavailableItems || checkoutBlocked || isStoreClosed || (orderType === "DELIVERY" && (!deliveryAddress || shippingFee === null || !!deliveryError))
                ? "bg-primary/60 text-white cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90 active:scale-[0.99]"
            )}
          >
            {checkout.status === "loading" ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  className="block w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                />
                Đang đặt...
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                Đặt hàng ngay
              </>
            )}
          </button>
        </div>
      </div>
      {hasUnavailableItems && (
        <p className="text-center text-xs font-semibold text-amber-700">
          Vui lòng xoá món không còn phục vụ để tiếp tục.
        </p>
      )}
      <PointsBreakdownSheet
        open={isPointsSheetOpen}
        onOpenChange={setIsPointsSheetOpen}
        eligibleMerchandiseVnd={totalAfterDiscountVnd}
        orderPoints={orderPoints}
        surplusPoints={surplusPoints}
        totalPoints={totalPoints}
      />
    </div>
  );
});
