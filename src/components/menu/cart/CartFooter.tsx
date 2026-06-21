"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { Ticket, MapPin, ChevronRight, Trash2, ShoppingBag } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { Address } from "@/src/lib/types/address";
import type { PriceConflict } from "@/src/services/orderService";

type CheckoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "price_changed"; conflicts: PriceConflict[] }
  | { status: "error"; message: string };

interface CartFooterProps {
  itemsLength: number;
  isLoggedIn: boolean;
  openLogin: () => void;
  isStoreClosed: boolean;
  closure_note: string | null;
  orderType: "PICKUP" | "DELIVERY";
  setOrderType: (type: "PICKUP" | "DELIVERY") => void;
  pickupTime: string;
  setPickupTime: (time: string) => void;
  minTimeStr: string;
  setIsTimeCustom: (custom: boolean) => void;
  handleToggleDragEnd: (event: any, info: any) => void;
  
  // Delivery State
  isFetchingAddress: boolean;
  deliveryAddress: Address | null;
  deliveryDistanceKm: number | null;
  deliveryError: string | null;
  shippingFee: number | null;
  setIsAddressPickerOpen: (open: boolean) => void;

  // Voucher / Pricing state
  productVouchersCount: number;
  addonVouchersCount: number;
  subtotalK: number;
  shippingK: number;
  totalDiscountK: number;
  grandTotalK: number;
  finalPrice: number;

  checkout: CheckoutState;
  handleCheckout: () => void;
  setShowClearConfirm: (show: boolean) => void;
}

export const CartFooter = memo(function CartFooter({
  itemsLength,
  isLoggedIn,
  openLogin,
  isStoreClosed,
  closure_note,
  orderType,
  setOrderType,
  pickupTime,
  setPickupTime,
  minTimeStr,
  setIsTimeCustom,
  handleToggleDragEnd,
  isFetchingAddress,
  deliveryAddress,
  deliveryDistanceKm,
  deliveryError,
  shippingFee,
  setIsAddressPickerOpen,
  productVouchersCount,
  addonVouchersCount,
  subtotalK,
  shippingK,
  totalDiscountK,
  grandTotalK,
  finalPrice,
  checkout,
  handleCheckout,
  setShowClearConfirm,
}: CartFooterProps) {
  if (itemsLength === 0) return null;

  return (
    <div className="border-t border-border/40 bg-white px-4 pb-2 pt-2.5 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.06)] space-y-2 flex flex-col touch-none">
      {/* Guest Voucher Teaser */}
      {!isLoggedIn && (
        <div className="mb-1 p-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[10px] font-medium text-orange-800">Đăng nhập để xem & áp dụng voucher</span>
          </div>
          <button onClick={openLogin} className="text-[10px] px-2.5 py-1 rounded-full font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors">Đăng nhập</button>
        </div>
      )}

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
            onClick={() => setOrderType("PICKUP")}
            className={cn(
              "relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors duration-300",
              orderType === "PICKUP" ? "text-white" : "text-primary/50 hover:text-primary/70"
            )}
          >
            Đến lấy
          </button>
          <button
            onClick={() => setOrderType("DELIVERY")}
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
              <p className="text-[10px] font-bold text-primary leading-tight">Giờ</p>
            </div>
            <input
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
              className={cn(
                "bg-transparent text-xs font-bold focus:outline-none w-16 text-right cursor-pointer",
                pickupTime && pickupTime < minTimeStr ? "text-red-500" : "text-primary"
              )}
            />
          </div>
          {pickupTime && pickupTime < minTimeStr && (
            <span className="text-[9px] text-red-500 font-medium text-right">
              Tối thiểu {minTimeStr}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Ưu đãi + Địa chỉ (60%) | Pricing (40%) */}
      <div className="flex gap-3 items-stretch">
        <motion.div 
          className="flex flex-col gap-1.5 min-h-[82px] touch-pan-y" style={{ width: "60%" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleToggleDragEnd}
        >
          {/* Delivery address trigger (only when DELIVERY) */}
          {orderType === "DELIVERY" && (
            <>
              <button
                onClick={() => setIsAddressPickerOpen(true)}
                className="flex items-center justify-between bg-green-50 border border-green-100 hover:bg-green-100/80 transition-colors rounded-xl px-2 py-2 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="bg-green-100 p-1 rounded-md text-green-600 shrink-0">
                    <MapPin size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-green-800 leading-tight">Giao đến</p>
                    <p className="text-[10px] text-green-600/80 leading-tight truncate">
                      {isFetchingAddress 
                        ? "Đang tải địa chỉ..." 
                        : deliveryAddress 
                          ? `${deliveryAddress.label || deliveryAddress.full_address}${deliveryDistanceKm !== null ? ` - ${deliveryDistanceKm.toFixed(1)}km` : ""}`
                          : "Chọn địa chỉ giao hàng"}
                    </p>
                  </div>
                </div>
                <ChevronRight size={13} className="text-green-400 shrink-0 ml-1" />
              </button>
              {deliveryError && (
                <p className="px-1 text-[11px] text-red-500 font-medium">{deliveryError}</p>
              )}
            </>
          )}
        </motion.div>

        {/* Right 40% - Pricing breakdown */}
        <div className="flex flex-col justify-end flex-1 gap-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-primary/50">Tạm tính</span>
            <span className="text-[11px] font-bold text-primary/50">{subtotalK} kđ</span>
          </div>

          {orderType === "DELIVERY" && shippingFee !== null ? (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-primary/50">Phí ship</span>
              <span className="text-[11px] font-bold text-primary/50">{shippingK} kđ</span>
            </div>
          ) : (
            <div className="flex items-center justify-between invisible">
              <span className="text-[10px] font-medium text-primary/50">Phí ship</span>
              <span className="text-[11px] font-bold text-primary/50">0 kđ</span>
            </div>
          )}

          {totalDiscountK > 0 ? (
            <div className="flex items-center justify-between text-orange-600">
              <span className="text-[10px] font-medium">Giảm giá</span>
              <span className="text-[11px] font-bold">-{totalDiscountK.toLocaleString("vi-VN")} kđ</span>
            </div>
          ) : (
            <div className="flex items-center justify-between invisible">
              <span className="text-[10px] font-medium">Giảm giá</span>
              <span className="text-[11px] font-bold">0 kđ</span>
            </div>
          )}
          
          <div className="border-t border-dashed border-border/40 my-0.5" />
          
          <div className="flex justify-between items-baseline mt-0.5">
            <span className="text-[9px] font-bold text-primary/40 uppercase tracking-widest leading-none">Tổng tiền</span>
            <div className="flex flex-col items-end">
              <span className="font-serif text-xl font-bold text-primary leading-none">
                {grandTotalK} kđ
              </span>
              {isLoggedIn && finalPrice >= 10000 && (
                <span className="text-[9px] font-bold text-teal-700 bg-teal-50 px-1 py-0.5 rounded-sm mt-0.5">
                  +{Math.floor(finalPrice / 10000)} điểm
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DIV 2: Action row */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => setShowClearConfirm(true)}
          disabled={checkout.status === "loading"}
          className={cn(
            "flex-[1] py-3.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center",
            checkout.status === "loading"
              ? "border-border/30 text-primary/20 cursor-not-allowed"
              : "border-border/60 text-primary/40 hover:border-red-300 hover:text-red-500 hover:bg-red-50"
          )}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          id="btn-checkout"
          onClick={handleCheckout}
          disabled={
            checkout.status === "loading" || 
            itemsLength === 0 || 
            (orderType === "PICKUP" && !!pickupTime && pickupTime < minTimeStr) || 
            isStoreClosed ||
            (orderType === "DELIVERY" && (!deliveryAddress || shippingFee === null || !!deliveryError))
          }
          className={cn(
            "flex-[3] py-3.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-1.5",
            checkout.status === "loading" || (orderType === "PICKUP" && !!pickupTime && pickupTime < minTimeStr) || isStoreClosed || (orderType === "DELIVERY" && (!deliveryAddress || shippingFee === null || !!deliveryError))
              ? "bg-primary/60 text-white cursor-not-allowed"
              : "bg-primary text-white hover:scale-[1.01] active:scale-[0.99]"
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
  );
});
