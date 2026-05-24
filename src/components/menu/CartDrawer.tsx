"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, ShoppingBag, CheckCircle2, AlertTriangle, RefreshCcw, Minus, Plus } from "lucide-react";
import { useCartStore, useCartTotalPrice } from "@/src/lib/store/cartStore";
import Image from "next/image";
import { createOrder, PriceChangedError, type PriceConflict } from "@/src/services/orderService";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";
import { cn } from "@/src/utils/cn";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "price_changed"; conflicts: PriceConflict[] }
  | { status: "error"; message: string };

// ── CartDrawer ─────────────────────────────────────────────────────────────────

const CartDrawer = () => {
  const { items, removeItem, updateQuantity, clearCart, isCartOpen, setCartOpen } = useCartStore();
  const totalPrice = useCartTotalPrice();
  const isLoggedIn = useIsLoggedIn();
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const router = useRouter();
  const { is_open: isStoreOpen, isLoaded: isStoreStatusLoaded, closure_note } = useStoreStatusStore();
  const isStoreClosed = isStoreStatusLoaded && !isStoreOpen;
  const [checkout, setCheckout] = useState<CheckoutState>({ status: "idle" });
  const [pickupTime, setPickupTime] = useState<string>("");
  const [minTimeStr, setMinTimeStr] = useState<string>("");
  const [isTimeCustom, setIsTimeCustom] = useState<boolean>(false);

  useEffect(() => {
    const updateTimes = () => {
      const minD = new Date(Date.now() + 10 * 60000);
      const defD = new Date(Date.now() + 11 * 60000);
      const pad = (n: number) => n.toString().padStart(2, '0');
      
      const newMinStr = `${pad(minD.getHours())}:${pad(minD.getMinutes())}`;
      const newDefStr = `${pad(defD.getHours())}:${pad(defD.getMinutes())}`;
      
      setMinTimeStr(newMinStr);
      if (!isTimeCustom) {
        setPickupTime(newDefStr);
      }
    };
    updateTimes();
    const interval = setInterval(updateTimes, 60000); // Cập nhật mỗi phút
    return () => clearInterval(interval);
  }, [isTimeCustom]);

  const resetCheckout = useCallback(() => setCheckout({ status: "idle" }), []);

  const handleCheckout = useCallback(async () => {
    if (items.length === 0) return;
    
    // Check authentication
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    setCheckout({ status: "loading" });

    try {
      let finalPickupTime: string | undefined = undefined;
      const minAllowedTime = Date.now() + 10 * 60 * 1000;

      if (pickupTime) {
        const [hours, minutes] = pickupTime.split(':');
        const selectedDate = new Date();
        selectedDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        
        // Add 1 min buffer for slow submissions
        if (selectedDate.getTime() < minAllowedTime - 60000) {
          setCheckout({ status: "error", message: "Thời gian nhận món phải cách hiện tại ít nhất 10 phút." });
          return;
        }
        finalPickupTime = selectedDate.toISOString();
      } else {
        // If not selected, send now + 10m
        finalPickupTime = new Date(minAllowedTime).toISOString();
      }

      const result = await createOrder(items, {
        pickupTime: finalPickupTime,
      });
      clearCart();
      setCartOpen(false);
      resetCheckout();
      setPickupTime("");
      setIsTimeCustom(false);
      router.push("/history");
    } catch (err) {
      if (err instanceof PriceChangedError) {
        setCheckout({ status: "price_changed", conflicts: err.conflicts });
      } else {
        const message = err instanceof Error ? err.message : "Đặt hàng thất bại. Vui lòng thử lại.";
        setCheckout({ status: "error", message });
      }
    }
  }, [items, clearCart, isLoggedIn, openLogin, router, setCartOpen, resetCheckout, pickupTime]);

  const handleClose = useCallback(() => {
    setCartOpen(false);
    resetCheckout();
  }, [setCartOpen, resetCheckout]);

  return (
    <AnimatePresence mode="wait">
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-70 bg-foreground/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-71 w-full max-w-sm bg-[#fdfcf7] border-l border-border shadow-2xl flex flex-col"
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <h2 className="font-serif text-2xl font-bold text-primary flex items-center gap-2">
                Giỏ cá <span className="text-3xl">🐟</span>
                {items.length > 0 && (
                  <span className="ml-1 text-sm font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    {items.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                )}
              </h2>
              <button
                onClick={handleClose}
                aria-label="Đóng giỏ hàng"
                className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
              >
                <X className="w-5 h-5 text-primary" />
              </button>
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-2 min-h-0">
              <AnimatePresence mode="wait">

                {/* PRICE_CHANGED */}
                {checkout.status === "price_changed" && (
                  <motion.div
                    key="price_changed"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-8 space-y-5"
                  >
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-sm text-amber-800">Giá đã thay đổi</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Một số sản phẩm đã được cập nhật giá. Vui lòng kiểm tra lại trước khi đặt hàng.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {checkout.conflicts.map((c) => (
                        <div key={`${c.menu_item_id}-${c.size}`} className="bg-white border border-border rounded-xl p-3">
                          <p className="font-bold text-sm text-primary">{c.name} · {c.size}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs line-through text-primary/40">{c.client_price_vnd / 1000}k</span>
                            <span className="text-xs">→</span>
                            <span className={cn(
                              "text-xs font-bold",
                              c.server_price_vnd > c.client_price_vnd ? "text-red-500" : "text-green-600"
                            )}>
                              {c.server_price_vnd / 1000}k
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-primary/50 text-center">
                      Hãy đóng giỏ hàng, xoá các sản phẩm và thêm lại để cập nhật giá mới
                    </p>
                    <button
                      onClick={resetCheckout}
                      className="w-full flex items-center justify-center gap-2 border-2 border-border rounded-2xl py-3 font-bold text-sm text-primary hover:bg-primary/5 transition-colors"
                    >
                      <RefreshCcw className="w-4 h-4" /> Quay lại giỏ hàng
                    </button>
                  </motion.div>
                )}

                {/* ERROR */}
                {checkout.status === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center py-16 gap-5"
                  >
                    <AlertTriangle className="w-16 h-16 text-red-400" strokeWidth={1.5} />
                    <div>
                      <p className="font-bold text-primary">Đặt hàng thất bại</p>
                      <p className="text-sm text-primary/50 mt-2">{checkout.message}</p>
                    </div>
                    <button
                      onClick={resetCheckout}
                      className="flex items-center gap-2 border-2 border-border rounded-2xl px-6 py-3 font-bold text-sm text-primary hover:bg-primary/5 transition-colors"
                    >
                      <RefreshCcw className="w-4 h-4" /> Thử lại
                    </button>
                  </motion.div>
                )}

                {/* IDLE / LOADING — Cart items list */}
                {(checkout.status === "idle" || checkout.status === "loading") && (
                  <motion.div key="list" className="space-y-3 mt-4">
                    {items.length === 0 ? (
                      <div className="text-center py-20 text-primary/40 space-y-4">
                        <span className="text-6xl block">😢</span>
                        <p className="font-bold text-lg italic">Giỏ cá trống</p>
                        <p className="text-sm">Thêm đồ uống vào giỏ nhé</p>
                      </div>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.cartId}
                          className="p-4 rounded-2xl bg-white border border-border shadow-sm relative overflow-hidden flex gap-3"
                        >
                          {/* Thumbnail */}
                          <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-secondary/10 border border-border/50 relative">
                            {item.imageUrl ? (
                              <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl">🍵</div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-sm text-primary leading-tight truncate">
                                {item.name}
                              </h4>
                              <button
                                onClick={() => removeItem(item.cartId)}
                                aria-label={`Xoá ${item.name}`}
                                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-primary/40 hover:text-red-500 hover:bg-red-50 transition-colors -mt-1 -mr-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Customisation details */}
                            <div className="mt-1.5 space-y-0.5">
                              {item.details && item.details.length > 0 ? (
                                item.details.map((detail, idx) => (
                                  <p key={idx} className="text-[11px] text-primary/60 font-medium flex items-start gap-1">
                                    <span className="text-primary/30 mt-[2px]">•</span>
                                    <span>{detail}</span>
                                  </p>
                                ))
                              ) : (
                                <p className="text-[11px] text-primary/60 font-medium">Size {item.size}</p>
                              )}
                            </div>

                            {/* Quantity stepper + Price */}
                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center gap-2 bg-primary/5 rounded-xl px-2 py-1">
                                <button
                                  onClick={() =>
                                    item.quantity <= 1
                                      ? removeItem(item.cartId)
                                      : updateQuantity(item.cartId, item.quantity - 1)
                                  }
                                  aria-label="Giảm số lượng"
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-sm font-bold text-primary w-5 text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => updateQuantity(item.cartId, item.quantity + 1)}
                                  aria-label="Tăng số lượng"
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <span className="text-sm font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-lg">
                                {(item.clientPriceVnd * item.quantity) / 1000}k
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Footer — only shown when items exist and not in success/error ── */}
            {items.length > 0 && (
              <div className="border-t border-border/40 bg-white px-6 py-5 space-y-4 shrink-0">
                {/* Pickup Time Picker */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-bold text-primary/80 text-sm">Thời gian nhận món</span>
                      <span className="text-[11px] text-primary/50">Thời gian đặt trước tối thiểu là 10 phút</span>
                    </div>
                    <input
                      type="time"
                      min={minTimeStr}
                      value={pickupTime}
                      onClick={(e) => {
                        // Trick to make the native picker start at minTimeStr instead of current time
                        if (!pickupTime) {
                          setPickupTime(minTimeStr);
                          setIsTimeCustom(true);
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPickupTime(val);
                        setIsTimeCustom(true);
                      }}
                      className={cn(
                        "border rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2",
                        pickupTime && pickupTime < minTimeStr 
                          ? "border-red-500 text-red-500 focus:ring-red-500/20" 
                          : "border-border text-primary focus:ring-primary/20"
                      )}
                    />
                  </div>
                  {pickupTime && pickupTime < minTimeStr && (
                    <span className="text-xs text-red-500 font-medium text-right mt-1">
                      Thời gian nhận tối thiểu là {minTimeStr}
                    </span>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="font-bold text-primary/60 text-sm tracking-widest uppercase">Tổng cộng</span>
                  <span className="font-serif text-2xl font-bold text-primary">
                    <span className="text-3xl">🐟</span> {totalPrice / 1000}k
                  </span>
                </div>

                {/* Store closed notice — shown above submit when store is closed */}
                {isStoreClosed && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                    <span className="text-base leading-none">🔴</span>
                    <span className="text-xs font-medium text-amber-800 leading-snug">
                      {closure_note
                        ? `Cửa hàng tạm đóng: ${closure_note}`
                        : "Cửa hàng hiện đang đóng cửa, chưa thể đặt hàng"}
                    </span>
                  </div>
                )}

                {/* Checkout CTA */}
                <button
                  id="btn-checkout"
                  onClick={handleCheckout}
                  disabled={checkout.status === "loading" || items.length === 0 || (!!pickupTime && pickupTime < minTimeStr) || isStoreClosed}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-sm shadow-xl transition-all flex items-center justify-center gap-2",
                    checkout.status === "loading" || (!!pickupTime && pickupTime < minTimeStr) || isStoreClosed
                      ? "bg-primary/60 text-white cursor-not-allowed"
                      : "bg-primary text-white hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                  )}
                >
                  {checkout.status === "loading" ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                        className="block w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                      />
                      Đang đặt hàng...
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      Đặt hàng ngay
                    </>
                  )}
                </button>

                {/* Clear cart */}
                {checkout.status === "idle" && (
                  <button
                    onClick={clearCart}
                    className="w-full text-center text-xs font-bold text-primary/40 hover:text-red-400 uppercase tracking-widest transition-colors flex items-center justify-center gap-1 py-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xoá tất cả
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CartDrawer;
