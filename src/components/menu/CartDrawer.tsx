"use client";

import React, { useState, useCallback, useEffect, useRef, Profiler } from "react";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from "framer-motion";
import { X, Trash2, ShoppingBag, CheckCircle2, AlertTriangle, RefreshCcw, Minus, Plus, Ticket, ChevronRight, Clock, ArrowLeft, MapPin } from "lucide-react";
import { useCartStore, useCartTotalPrice } from "@/src/lib/store/cartStore";
import Image from "next/image";
import { useCheckout } from "@/src/hooks/useCheckout";
import { PriceChangedError, type PriceConflict } from "@/src/services/orderService";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";
import { cn } from "@/src/utils/cn";
import { useRouter } from "next/navigation";
import { listMyVouchers, type MyVoucher } from "@/src/services/customerVoucherService";
import { filterUsableVouchers, buildAddonVoucherMap, buildProductVoucherMap, estimateProductSavings, estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { DeliverySection } from "@/src/components/delivery/DeliverySection";
import type { Address } from "@/src/lib/types/address";
import { useQuery } from "@tanstack/react-query";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import { line1ItemDetails, line2ItemDetails, addonsDetails } from "@/src/utils/cartHelpers";
import ProductModal from "@/src/components/shared/ProductModal";
import type { CartItem } from "@/src/lib/types/cart";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "price_changed"; conflicts: PriceConflict[] }
  | { status: "error"; message: string };

// ── CartDrawer ─────────────────────────────────────────────────────────────────

const CartDrawer = () => {
  const { items, removeItem, updateQuantity, clearCart, isCartOpen, setCartOpen, applyProductVoucher, removeProductVoucher, applyAddonVoucher, removeAddonVoucher } = useCartStore();
  const subtotalPrice = useCartTotalPrice();
  const isLoggedIn = useIsLoggedIn();
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const router = useRouter();
  const { is_open: isStoreOpen, isLoaded: isStoreStatusLoaded, closure_note } = useStoreStatusStore();
  const isStoreClosed = isStoreStatusLoaded && !isStoreOpen;
  const [checkout, setCheckout] = useState<CheckoutState>({ status: "idle" });
  const [pickupTime, setPickupTime] = useState<string>("");
  const [minTimeStr, setMinTimeStr] = useState<string>("");
  const [isTimeCustom, setIsTimeCustom] = useState<boolean>(false);

  // ── Voucher state ──
  const [allVouchers, setAllVouchers] = useState<MyVoucher[]>([]);
  /** IDs of selected DISCOUNT vouchers. Server rule: max 1 PERCENT + unlimited FIXED. */
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);

  // ── UI overlay state ──
  const [isDiscountPickerOpen, setIsDiscountPickerOpen] = useState(false);
  const [activeItemForVoucher, setActiveItemForVoucher] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isAddressPickerOpen, setIsAddressPickerOpen] = useState(false);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);

  // ── Delivery state ──
  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState<Address | null>(null);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [isVouchersLoading, setIsVouchersLoading] = useState(false);

  const checkoutMutation = useCheckout();

  const { data: menuData } = useQuery({ queryKey: ["menu"], queryFn: fetchMenu });
  const { data: powderData } = useQuery({ queryKey: ["powders"], queryFn: fetchPowders });
  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion] : [];

  // --- Pull-to-dismiss logic ---
  const y = useMotionValue<number | string>(0);
  const scale = useTransform(y, (latest) => {
    if (typeof latest === "string") return 1;
    if (latest < 0) return 1;
    if (latest > 300) return 0.9;
    return 1 - (latest / 300) * 0.1;
  });
  const dragControls = useDragControls();

  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;
    const scrollTop = contentRef.current.scrollTop;
    const currentY = e.touches[0].clientY;

    if (scrollTop <= 0) {
      if (!isPulling.current) {
        touchStartY.current = currentY;
        isPulling.current = true;
      }
      const deltaY = currentY - touchStartY.current;
      if (deltaY > 0) {
        y.set(deltaY);
      } else {
        y.set(0);
      }
    } else {
      isPulling.current = false;
      if (typeof y.get() === "number" && (y.get() as number) > 0) y.set(0);
    }
  };

  const handleTouchEnd = () => {
    isPulling.current = false;
    if (typeof y.get() === "number" && (y.get() as number) > 100) {
      handleClose();
    } else if (typeof y.get() === "number" && (y.get() as number) > 0) {
      animate(y, 0, { type: "spring", stiffness: 300, damping: 28 });
    }
  };

  // Derived voucher lists
  const discountVouchers = filterUsableVouchers(allVouchers, "DISCOUNT");
  const freeshipVouchers = filterUsableVouchers(allVouchers, "FREESHIP");
  const applicableAddonVouchersMap = buildAddonVoucherMap(allVouchers, items);
  const applicableProductVouchers = buildProductVoucherMap(allVouchers, items);

  // Calculate final display price using multi-voucher estimator
  const selectedDiscountVouchers = discountVouchers.filter(v => selectedVoucherIds.includes(v.id));
  const rawDiscountAmount = estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice);
  
  // Apply rounding rules to avoid .5k decimals in UI
  const subtotalK = Math.ceil(subtotalPrice / 1000);
  const discountK = Math.floor(rawDiscountAmount / 1000); // Conservative discount display
  const finalK = Math.max(0, subtotalK - discountK);
  
  const shippingK = orderType === "DELIVERY" && shippingFee !== null ? Math.floor(shippingFee / 1000) : 0;
  
  let freeshipDiscountK = 0;
  let appliedFreeshipId: string | null = null;
  // total after discount (before shipping) = finalK * 1000
  const totalAfterDiscount = finalK * 1000;
  const selectedFreeshipVouchers = freeshipVouchers.filter(v => selectedVoucherIds.includes(v.id));
  if (orderType === "DELIVERY" && shippingFee !== null && selectedFreeshipVouchers.length > 0) {
    const bestVoucher = selectedFreeshipVouchers[0];
    freeshipDiscountK = Math.floor(Math.min(shippingFee, bestVoucher.covered_delivery_fee_vnd ?? 0) / 1000);
    appliedFreeshipId = bestVoucher.id;
  }

  const totalDiscountK = discountK + freeshipDiscountK;
  const grandTotalK = Math.max(0, finalK + shippingK - freeshipDiscountK);
  
  const discountAmount = discountK * 1000;
  const finalPrice = grandTotalK * 1000;

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

  const handleToggleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 30) {
      setOrderType("PICKUP");
    } else if (info.offset.x < -30) {
      setOrderType("DELIVERY");
    }
  };

  // Prevent background scrolling when cart is open
  useEffect(() => {
    if (isCartOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isCartOpen]);

  // Fetch all vouchers when cart opens + user logged in
  useEffect(() => {
    if (!isCartOpen || !isLoggedIn) {
      setAllVouchers([]);
      setSelectedVoucherIds([]);
      return;
    }
    setIsVouchersLoading(true);
    listMyVouchers()
      .then(setAllVouchers)
      .catch(() => {}) // silently fail — non-critical
      .finally(() => setIsVouchersLoading(false));
  }, [isCartOpen, isLoggedIn]);

  // Auto-fetch default address when switching to DELIVERY
  useEffect(() => {
    if (orderType === "DELIVERY" && !deliveryAddress && isLoggedIn) {
      let isMounted = true;
      setIsFetchingAddress(true);
      import("@/src/services/addressService").then(({ addressService }) => {
        addressService.getAddresses()
          .then(async (data) => {
            if (!isMounted) return;
            const defaultAddr = data.find(a => a.is_default) || data[0];
            if (defaultAddr) {
              setDeliveryAddress(defaultAddr);
              try {
                if (defaultAddr.distance_km !== null) {
                  import("@/src/constants/delivery").then(({ DELIVERY_CONFIG }) => {
                    if (defaultAddr.distance_km! > DELIVERY_CONFIG.MAX_RADIUS_KM) {
                      if (isMounted) {
                        setDeliveryDistanceKm(null);
                        setShippingFee(null);
                        setDeliveryError(`Ngoài vùng giao hàng (${defaultAddr.distance_km!.toFixed(1)}km / tối đa ${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`);
                      }
                      return;
                    }
                    import("@/src/utils/pricing").then(({ calcShippingFee }) => {
                      if (isMounted) {
                        setDeliveryDistanceKm(defaultAddr.distance_km);
                        setShippingFee(calcShippingFee(defaultAddr.distance_km!));
                        setDeliveryError(null);
                      }
                    });
                  });
                } else {
                  const { deliveryService } = await import("@/src/services/deliveryService");
                  const estimate = await deliveryService.estimateFee(defaultAddr.lat, defaultAddr.lng);
                  if (isMounted) {
                    setDeliveryDistanceKm(estimate.distance_km);
                    setShippingFee(estimate.shipping_fee_vnd);
                    setDeliveryError(null);
                  }
                }
              } catch (err: any) {
                if (isMounted) {
                  setDeliveryDistanceKm(null);
                  setShippingFee(null);
                  setDeliveryError(err.message || "Không thể tính phí giao hàng");
                }
              }
            }
          })
          .finally(() => {
            if (isMounted) setIsFetchingAddress(false);
          });
      });
      return () => { isMounted = false; };
    }
  }, [orderType, deliveryAddress, isLoggedIn]);

  const handleCheckout = () => setShowSubmitConfirm(true);

  const executeCheckout = useCallback(async () => {
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

      let payloadItems = [...items];

      if (orderType === "DELIVERY") {
        if (!deliveryAddress || shippingFee === null) {
          setCheckout({ status: "error", message: "Vui lòng chọn địa chỉ giao hàng hợp lệ." });
          return;
        }
      }

      const result = await checkoutMutation.mutateAsync({
        items: payloadItems,
        options: {
          orderType,
          pickupTime: finalPickupTime,
          discountVoucherIds: selectedVoucherIds,
          ...(orderType === "DELIVERY" && deliveryAddress ? {
            addressId: deliveryAddress.id,
            deliveryAddress: deliveryAddress.full_address,
            deliveryLat: deliveryAddress.lat,
            deliveryLng: deliveryAddress.lng,
            deliveryReceiverName: deliveryAddress.receiver_name,
            deliveryReceiverPhone: deliveryAddress.receiver_phone,
            clientShippingFeeVnd: shippingFee ?? 0,
            freeshipVoucherId: appliedFreeshipId ?? undefined,
          } : {})
        }
      });
      clearCart();
      setCartOpen(false);
      resetCheckout();
      setPickupTime("");
      setIsTimeCustom(false);
      setSelectedVoucherIds([]);
      router.push("/history");
    } catch (err) {
      if (err instanceof PriceChangedError) {
        setCheckout({ status: "price_changed", conflicts: err.conflicts });
      } else {
        const message = err instanceof Error ? err.message : "Đặt hàng thất bại. Vui lòng thử lại.";
        setCheckout({ status: "error", message });
      }
    }
  }, [items, clearCart, isLoggedIn, openLogin, router, setCartOpen, resetCheckout, pickupTime, selectedVoucherIds]);

  const handleClose = useCallback(() => {
    setCartOpen(false);
    resetCheckout();
    setSelectedVoucherIds([]);
    setIsDiscountPickerOpen(false);
    setActiveItemForVoucher(null);
    setIsAddressPickerOpen(false);
    setOrderType("PICKUP");
    setDeliveryAddress(null);
    setShippingFee(null);
    setTimeout(() => y.set(0), 300);
  }, [setCartOpen, resetCheckout, y]);

  /** The cart item currently being assigned a voucher. */
  const activeItem = items.find(i => i.cartId === activeItemForVoucher);

  const handleEditItem = (cartItem: CartItem) => {
    const menuItem = menuItems.find(m => m.id === cartItem.menuItemId);
    if (!menuItem) {
      // It's handled visually via unavailable state, so just return
      return;
    }
    setEditingCartItem(cartItem);
    // Removed setCartOpen(false) to keep cart drawer visible underneath
  };

  return (
    <Profiler id="CartDrawer" onRender={onRenderCallback}>
    <>
    <AnimatePresence mode="wait">
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-70 bg-foreground/40 backdrop-blur-sm touch-none"
            onClick={handleClose}
          />

          {/* Drawer shell — overlays are rendered inside via `absolute inset-0` */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ y, scale, touchAction: "pan-y" }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 300) {
                handleClose();
              }
            }}
            className="fixed bottom-0 left-0 right-0 h-[100dvh] mx-auto z-71 w-full max-w-md bg-[#fdfcf7] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* ── Main cart view ───────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden relative">

              {/* Mobile Drag Handle */}
              <div 
                onPointerDown={(e) => dragControls.start(e)}
                className="flex justify-center pt-2 pb-1 w-full shrink-0 touch-none bg-white/60 backdrop-blur-md"
              >
                <div className="w-10 h-1 bg-border rounded-full" />
              </div>

              {/* Header */}
              <div 
                onPointerDown={(e) => dragControls.start(e)}
                className="flex items-center justify-between px-4 pt-0 pb-2 border-b border-border/40 shrink-0 bg-white/60 backdrop-blur-md touch-none"
              >
                <h2 className="font-serif text-lg font-bold text-primary flex items-center gap-1.5">
                  Giỏ cá <span className="text-2xl">🐟</span>
                  {items.length > 0 && (
                    <span className="ml-1 text-xs font-bold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                      {items.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </h2>
                <button
                  onClick={handleClose}
                  aria-label="Đóng giỏ hàng"
                  className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
                >
                  <X className="w-4 h-4 text-primary" />
                </button>
              </div>



              {/* Scrollable content */}
              <div 
                ref={contentRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 min-h-0"
              >
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
                              <span className="text-[13px] line-through text-primary/40">{c.client_price_vnd / 1000} ká</span>
                              <span className="text-xs">→</span>
                              <span className={cn(
                                "text-[13px] font-bold",
                                c.server_price_vnd > c.client_price_vnd ? "text-red-500" : "text-green-600"
                              )}>
                                {c.server_price_vnd / 1000} ká
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
                    <motion.div key="list" className="space-y-4">
                      {items.length === 0 ? (
                        <div className="text-center py-20 text-primary/40 space-y-4">
                          <span className="text-6xl block">😢</span>
                          <p className="font-bold text-lg italic">Giỏ cá trống</p>
                          <p className="text-sm">Thêm đồ uống vào giỏ nhé</p>
                        </div>
                      ) : (
                        items.map((item) => {
                          const productVouchersForItem = applicableProductVouchers.get(item.menuItemId) || [];
                          const addonVouchersForItem = applicableAddonVouchersMap.get(item.cartId) || [];
                          const hasMoreProductVouchers = !item.productVoucherId && productVouchersForItem.length > 0;
                          const hasMoreAddonVouchers = addonVouchersForItem.length > 0;
                          const hasAvailableVouchers = hasMoreProductVouchers || hasMoreAddonVouchers;
                          const hasAnyVoucher = !!item.productVoucherId || (item.addonVouchers && item.addonVouchers.length > 0);

                          const menuItem = menuItems.find(m => m.id === item.menuItemId);
                          const line1Chips = line1ItemDetails(item, menuItem, powderData?.data);
                          const line2Chips = line2ItemDetails(item, menuItem);
                          const addonChips = addonsDetails(item, menuItem, powderData?.data);
                          
                          // Line 4: note
                          const noteText = item.note || null;
                          const isUnavailable = !menuItem;

                          return (
                            <div
                              key={item.cartId}
                              onClick={() => handleEditItem(item)}
                              className={cn(
                                "p-3.5 rounded-[1.25rem] bg-white border border-transparent shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] transition-colors flex gap-3.5 cursor-pointer",
                                isUnavailable ? "opacity-50 pointer-events-none" : "hover:border-border/60"
                              )}
                            >
                              {/* Thumbnail & Stepper */}
                              <div className="flex flex-col items-center gap-2 shrink-0">
                                <div className="w-[5.5rem] h-[5.5rem] rounded-2xl overflow-hidden bg-secondary/10 relative">
                                  {item.imageUrl ? (
                                    <Image src={item.imageUrl} alt={item.name} fill sizes="88px" className="object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-4xl">🍵</div>
                                  )}
                                </div>
                                
                                {!hasAnyVoucher && (
                                  <div 
                                    className="flex items-center gap-2.5 bg-white border border-border shadow-sm rounded-full px-1.5 py-1 w-full justify-between"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => item.quantity <= 1 ? removeItem(item.cartId) : updateQuantity(item.cartId, item.quantity - 1)}
                                      aria-label="Giảm số lượng"
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-xs font-bold text-primary text-center">
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
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                {/* Title + Delete */}
                                <div className="flex items-start justify-between w-full">
                                  <h4 className="font-bold text-sm text-primary leading-tight truncate w-4/5 pr-2">
                                    {item.name} {item.category === "fusion" && powderData?.data?.find(p => p.id === item.selectedPowderId)?.name && `- ${powderData?.data?.find(p => p.id === item.selectedPowderId)?.name}`}
                                  </h4>
                                  <div className="w-1/5 flex justify-end">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeItem(item.cartId);
                                      }}
                                      aria-label={`Xoá ${item.name}`}
                                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-primary/30 hover:text-red-500 hover:bg-red-50 transition-colors -mt-1 -mr-1"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Customize (full line) */}
                                <div className="mt-1.5 flex flex-col gap-1 w-full">
                                  {/* Line 1 — Size + Milk/Powder */}
                                  {line1Chips.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {line1Chips.map((chip, idx) => (
                                        <span key={idx} className="text-[11px] font-medium bg-primary/25 text-primary px-2 py-0.5 rounded-full">{chip}</span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Line 2 — Sweetness + Ice + Coldwhisk */}
                                  {line2Chips.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {line2Chips.map((chip, idx) => (
                                        <span key={idx} className="text-[11px] font-medium bg-primary/20 text-primary/[0.95] px-2 py-0.5 rounded-full">{chip}</span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Line 3 — Addons + Đá dừa + Extra matcha */}
                                  {addonChips.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {addonChips.map((chip, idx) => (
                                        <span key={idx} className="text-[11px] font-medium bg-primary/15 text-primary/90 px-2 py-0.5 rounded-full">{chip}</span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Line 4 — Note */}
                                  {noteText && (
                                    <span className="text-[11px] font-medium bg-primary/5 text-primary/80 px-2 py-0.5 rounded-full italic inline-block">📝 {noteText}</span>
                                  )}
                                </div>

                                {/* Voucher tags / CTA and Price at the bottom */}
                                <div className="flex items-end justify-between mt-3 gap-2 w-full">
                                  {/* Vouchers (Left side) */}
                                  <div className="flex flex-wrap gap-1.5 flex-1">
                                    {/* Applied: product voucher */}
                                    {item.productVoucherId && (() => {
                                      const pv = allVouchers.find(v => v.id === item.productVoucherId);
                                      return (
                                        <div className="text-[10px] font-bold bg-orange-50 border border-orange-200 text-orange-700 pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                          <Ticket className="w-3 h-3 text-orange-500" /> {pv?.package?.name || "Free món"}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); removeProductVoucher(item.cartId); }}
                                            aria-label="Bỏ voucher sản phẩm"
                                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-orange-200 text-orange-500 hover:text-orange-700 transition-colors ml-0.5"
                                          >
                                            <X size={12} strokeWidth={2.5} />
                                          </button>
                                        </div>
                                      );
                                    })()}
                                    {/* Applied: addon vouchers */}
                                    {item.addonVouchers && item.addonVouchers.map(av => {
                                      const voucherInfo = allVouchers.find(v => v.id === av.voucherId);
                                      return (
                                        <div key={av.voucherId} className="text-[10px] font-bold bg-green-50 border border-green-200 text-green-700 pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                          <Ticket className="w-3 h-3 text-green-600" /> Free {voucherInfo?.addonOption?.label || "Topping"}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); removeAddonVoucher(item.cartId, av.voucherId); }}
                                            aria-label="Bỏ voucher topping"
                                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-green-200 text-green-600 hover:text-green-800 transition-colors ml-0.5"
                                          >
                                            <X size={12} strokeWidth={2.5} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {/* Available vouchers CTA */}
                                    {hasAvailableVouchers && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setActiveItemForVoucher(item.cartId); }}
                                        className="text-[10px] font-bold bg-white border border-dashed border-orange-300 text-orange-600 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-orange-50 hover:border-solid transition-all shadow-sm"
                                      >
                                        <Ticket className="w-3 h-3" />
                                        Chọn ưu đãi ({productVouchersForItem.length + addonVouchersForItem.length})
                                      </button>
                                    )}
                                  </div>

                                  {/* Price (Right side) */}
                                  <div className="flex items-center gap-1.5 shrink-0 justify-end">
                                    {item.originalClientPriceVnd > item.clientPriceVnd && (
                                      <span className="text-[12px] line-through text-primary/30 font-medium">
                                        {(item.originalClientPriceVnd * item.quantity) / 1000} ká
                                      </span>
                                    )}
                                    <span className="font-bold text-[15px] text-primary">
                                      {(item.clientPriceVnd * item.quantity) / 1000} ká
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ───────────────────────────────────────────────── */}
              {items.length > 0 && (
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
                      <span className="text-base leading-none mt-0.5 shrink-0">🔴</span>
                      <span className="text-xs font-medium text-amber-800 leading-snug flex-1">
                        {closure_note
                          ? `Cửa hàng tạm đóng: ${closure_note}`
                          : "Cửa hàng hiện đang đóng cửa, chưa thể đặt hàng"}
                      </span>
                    </div>
                  )}

                  {/* ── Row 1: Order Type Toggle (2/3) + Giờ nhận (1/3) ── */}
                  <div className="flex gap-2 items-stretch">
                    {/* Left 2/3 — Order type toggle */}
                    <motion.div 
                      className="relative flex bg-secondary/10 p-1 rounded-xl" style={{ width: "66.67%" }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.15}
                      onDragEnd={handleToggleDragEnd}
                    >
                      {/* Sliding Background Indicator */}
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

                    {/* Right 1/3 — Giờ nhận */}
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

                  {/* ── Row 2: Ưu đãi + Địa chỉ (60%) | Pricing (40%) ── */}
                  <div className="flex gap-3 items-stretch">

                    {/* Left 60% — Voucher + Delivery address */}
                    <motion.div 
                      className="flex flex-col gap-1.5 min-h-[82px] touch-pan-y" style={{ width: "60%" }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.15}
                      onDragEnd={handleToggleDragEnd}
                    >

                      {/* Voucher trigger pill */}
                      {isLoggedIn && (isVouchersLoading || discountVouchers.length > 0 || freeshipVouchers.length > 0) && (
                        <button
                          onClick={() => setIsDiscountPickerOpen(true)}
                          className="flex items-center justify-between bg-orange-50 border border-orange-100 hover:bg-orange-100/80 transition-colors rounded-xl px-2 py-2 text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="bg-orange-100 p-1 rounded-md text-orange-600 shrink-0">
                              <Ticket size={13} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-orange-800 leading-tight">Ưu đãi</p>
                              <p className="text-[10px] text-orange-600/80 leading-tight truncate">
                                {isVouchersLoading 
                                  ? "Đang tải..." 
                                  : selectedVoucherIds.length > 0
                                    ? `${selectedVoucherIds.length} mã đang áp`
                                    : "Chọn mã"}
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={13} className="text-orange-400 shrink-0 ml-1" />
                        </button>
                      )}

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
                                      ? `${deliveryAddress.label || deliveryAddress.full_address}${deliveryDistanceKm !== null ? ` · ${deliveryDistanceKm.toFixed(1)}km` : ""}`
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

                    {/* Right 40% — Pricing breakdown */}
                    <div className="flex flex-col justify-end flex-1 gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-primary/50">Tạm tính</span>
                        <span className="text-[11px] font-bold text-primary/50">{subtotalK} ká</span>
                      </div>

                      {orderType === "DELIVERY" && shippingFee !== null ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-primary/50">Phí ship</span>
                          <span className="text-[11px] font-bold text-primary/50">{shippingK} ká</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between invisible">
                          <span className="text-[10px] font-medium text-primary/50">Phí ship</span>
                          <span className="text-[11px] font-bold text-primary/50">0 ká</span>
                        </div>
                      )}

                      {totalDiscountK > 0 ? (
                        <div className="flex items-center justify-between text-orange-600">
                          <span className="text-[10px] font-medium">Giảm giá</span>
                          <span className="text-[11px] font-bold">-{totalDiscountK.toLocaleString("vi-VN")} ká</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between invisible">
                          <span className="text-[10px] font-medium">Giảm giá</span>
                          <span className="text-[11px] font-bold">0 ká</span>
                        </div>
                      )}
                      
                      <div className="border-t border-dashed border-border/40 my-0.5" />
                      
                      <div className="flex justify-between items-baseline mt-0.5">
                        <span className="text-[9px] font-bold text-primary/40 uppercase tracking-widest leading-none">Tổng tiền</span>
                        <div className="flex flex-col items-end">
                          <span className="font-serif text-xl font-bold text-primary leading-none">
                            {grandTotalK} ká
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

                  {/* ── DIV 2: Action row ── */}
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
                        items.length === 0 || 
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
              )}
            </div>


            {/* ── Overlay: Item Voucher Picker ─────────────────────────────── */}
            <AnimatePresence>
              {activeItemForVoucher && activeItem && (
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
                      onClick={() => setActiveItemForVoucher(null)}
                      className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 text-primary" />
                    </button>
                    <h3 className="font-bold text-primary">Ưu đãi cho món này</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-6">
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
                            const savings = estimateProductSavings(v, activeItem.originalClientPriceVnd);
                            const isSelected = activeItem.productVoucherId === v.id;
                            const isAlreadyUsed = items.some(c => c.cartId !== activeItem.cartId && c.productVoucherId === v.id);
                            
                            return (
                              <button
                                key={v.id}
                                disabled={isAlreadyUsed}
                                onClick={() => {
                                  if (isAlreadyUsed) return;
                                  if (isSelected) {
                                    removeProductVoucher(activeItem.cartId);
                                  } else {
                                    applyProductVoucher(activeItem.cartId, v.id, v.covered_price_vnd ?? 0);
                                  }
                                  setActiveItemForVoucher(null);
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
                              const isSelected = activeItem.addonVouchers?.some(av => av.voucherId === v.id);
                              const isAlreadyUsed = items.some(c => c.cartId !== activeItem.cartId && c.addonVouchers?.some(av => av.voucherId === v.id));
                              
                              return (
                                <button
                                  key={v.id}
                                  disabled={isAlreadyUsed}
                                  onClick={() => {
                                    if (isAlreadyUsed) return;
                                    if (isSelected) {
                                      removeAddonVoucher(activeItem.cartId, v.id);
                                    } else {
                                      applyAddonVoucher(activeItem.cartId, v.id, v.addon_option_id!);
                                    }
                                    setActiveItemForVoucher(null);
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
              )}
            </AnimatePresence>

            {/* ── Overlay: Discount Voucher Picker (multi-select) ───────────── */}
            <AnimatePresence>
              {isDiscountPickerOpen && (() => {
                // Whether there's already a PERCENT voucher selected — limit 1
                const hasSelectedPercent = selectedDiscountVouchers.some(v => v.discount_type === "PERCENT");

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
                          onClick={() => setIsDiscountPickerOpen(false)}
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
                          onClick={() => setSelectedVoucherIds([])}
                          className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors shrink-0"
                        >
                          Bỏ tất cả
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                              setSelectedVoucherIds((prev) =>
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
                          onClick={() => setIsDiscountPickerOpen(false)}
                          className="mt-3 w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors"
                        >
                          Xác nhận
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* ── Overlay: Address Picker ───────────────────────────────── */}
            <AnimatePresence>
              {isAddressPickerOpen && (
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="absolute inset-0 z-20 bg-[#fdfcf7] flex flex-col"
                >
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-white">
                    <button
                      onClick={() => setIsAddressPickerOpen(false)}
                      className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 text-primary" />
                    </button>
                    <h3 className="font-bold text-primary flex-1 text-base">Địa chỉ giao hàng</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 bg-[#fdfcf7]">
                    <DeliverySection
                      selectedAddressId={deliveryAddress?.id ?? null}
                      onAddressSelect={(address, distance, fee) => {
                        setDeliveryAddress(address);
                        setDeliveryDistanceKm(distance);
                        setShippingFee(fee);
                        // Auto-close overlay when selection finishes (fee is calculated successfully)
                        if (address && fee !== null) {
                          setIsAddressPickerOpen(false);
                        }
                      }}
                      onError={setDeliveryError}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
          
          <ConfirmModal
            isOpen={showClearConfirm}
            onCancel={() => setShowClearConfirm(false)}
            onConfirm={() => {
              clearCart();
              setShowClearConfirm(false);
            }}
            title="Xoá giỏ cá?"
            message="Bạn có chắc muốn xoá tất cả đồ uống khỏi giỏ cá?"
            confirmLabel="Xoá tất cả"
            isDestructive={true}
          />

          <ConfirmModal
            isOpen={showSubmitConfirm}
            onCancel={() => setShowSubmitConfirm(false)}
            onConfirm={() => {
              setShowSubmitConfirm(false);
              executeCheckout();
            }}
            title="Xác nhận đặt hàng"
            message="Bạn có chắc chắn muốn đặt đơn hàng này không?"
            confirmLabel="Đặt hàng"
            isDestructive={false}
          />
        </>
      )}
    </AnimatePresence>

    {/* Product Modal overlay for edit */}
    {editingCartItem && (() => {
      const menuItem = menuItems.find(m => m.id === editingCartItem.menuItemId);
      if (!menuItem) return null;
      return (
        <ProductModal
          key="edit-modal"
          item={menuItem}
          latteItems={menuData?.latte ?? []}
          editingItem={editingCartItem}
          onClose={() => {
            setEditingCartItem(null);
          }}
          availableVouchers={allVouchers}
        />
      );
    })()}
    </>
    </Profiler>
  );
};

export default CartDrawer;