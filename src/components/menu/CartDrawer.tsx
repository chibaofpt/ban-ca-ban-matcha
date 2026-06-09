"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  // ── Delivery state ──
  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState<Address | null>(null);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [isVouchersLoading, setIsVouchersLoading] = useState(false);

  const checkoutMutation = useCheckout();

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
  if (orderType === "DELIVERY" && shippingFee !== null && freeshipVouchers.length > 0) {
    // Filter vouchers that meet min_order_vnd requirement
    const eligibleFreeship = freeshipVouchers.filter(v => 
      v.min_order_vnd === null || v.min_order_vnd === undefined || totalAfterDiscount >= v.min_order_vnd
    );
    if (eligibleFreeship.length > 0) {
      const bestVoucher = eligibleFreeship.reduce((best, v) => (v.covered_delivery_fee_vnd ?? 0) > (best.covered_delivery_fee_vnd ?? 0) ? v : best, eligibleFreeship[0]);
      freeshipDiscountK = Math.floor(Math.min(shippingFee, bestVoucher.covered_delivery_fee_vnd ?? 0) / 1000);
      appliedFreeshipId = bestVoucher.id;
    }
  }

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
  }, [setCartOpen, resetCheckout]);

  /** The cart item currently being assigned a voucher. */
  const activeItem = items.find(i => i.cartId === activeItemForVoucher);

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

          {/* Drawer shell — overlays are rendered inside via `absolute inset-0` */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-71 w-full max-w-md bg-[#fdfcf7] md:rounded-l-3xl border-l border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* ── Main cart view ───────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden relative">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 shrink-0 bg-white/60 backdrop-blur-md">
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

              {/* Order Type Toggle */}
              <div className="px-5 pt-4 pb-2 shrink-0 bg-[#fdfcf7] z-10">
                <div className="flex bg-secondary/10 p-1 rounded-2xl">
                  <button
                    onClick={() => setOrderType("PICKUP")}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-xl transition-all",
                      orderType === "PICKUP" ? "bg-white text-primary shadow-sm" : "text-primary/50 hover:text-primary/70"
                    )}
                  >
                    Đến lấy
                  </button>
                  <button
                    onClick={() => setOrderType("DELIVERY")}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-xl transition-all",
                      orderType === "DELIVERY" ? "bg-white text-primary shadow-sm" : "text-primary/50 hover:text-primary/70"
                    )}
                  >
                    Giao hàng
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-5 pb-4 min-h-0">
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

                          // Parse details for new layout
                          const sizeLabel = item.size === "M" ? "Cá con" : item.size === "L" ? "Cá vừa" : "Cá lớn";
                          const sweetnessMap: Record<string, string> = { NONE: "Không đường", QUARTER: "Ngọt ít", HALF: "Ngọt vừa", THREE_QUARTER: "Ngọt nhiều", FULL: "Siêu ngọt" };
                          const iceMap: Record<string, string> = { NORMAL: "", LESS_ICE: "Ít đá", NO_ICE: "Không đá", SEPARATE_ICE: "Đá riêng" };
                          const sw = item.sweetness !== "HALF" ? sweetnessMap[item.sweetness] : null;
                          const ic = item.iceOption !== "NORMAL" ? iceMap[item.iceOption] : null;
                          
                          const powderDetail = item.details?.find(d => d.startsWith("Bột: "));
                          let powderName = null;
                          let extraMatcha = null;
                          if (powderDetail) {
                            const raw = powderDetail.replace("Bột: ", "");
                            const match = raw.match(/^(.*?)( \+?\d+g)?$/);
                            if (match) {
                              powderName = match[1];
                              extraMatcha = match[2]?.trim() || null;
                            }
                          }

                          const hasDaDua = item.details?.some(d => d.includes("Đá dừa"));
                          let icDisplay = ic;
                          if (hasDaDua) {
                            icDisplay = ic ? `${ic} (Đá dừa)` : "Đá dừa";
                          }
                          
                          const line1 = [sizeLabel, sw, icDisplay].filter(Boolean).join(" · ");
                          
                          const coldwhisk = item.coldwhisk ? "Coldwhisk" : null;
                          const milk = item.details?.find(d => d.startsWith("Sữa: "));
                          
                          const line2 = [coldwhisk, milk].filter(Boolean).join(" · ");
                          
                          let line4 = null;
                          if (extraMatcha) {
                            const ex = extraMatcha.startsWith("+") ? extraMatcha : `+${extraMatcha}`;
                            line4 = `${ex} bột ${powderName}`;
                          }
                          
                          // Exclude already parsed details
                          const productModalSweetnessLabels = ["Lạt", "Ít ngọt", "Vừa", "Ngọt", "Rất ngọt"];
                          const addons = item.details?.filter(d => {
                            if (d.startsWith("Size ")) return false;
                            if (d.startsWith("Bột: ")) return false;
                            if (d.startsWith("Sữa: ")) return false;
                            if (d.startsWith("Ghi chú: ")) return false;
                            if (d.startsWith("Đá: ")) return false;
                            if (d === "Đánh lạnh foam" || d === "Đánh lạnh (Coldwhisk)") return false;
                            if (productModalSweetnessLabels.includes(d)) return false;
                            if (d.includes("Đá dừa")) return false;
                            return true;
                          }).map(d => d.startsWith("+") ? d : `+${d}`);
                          const line3 = addons?.join(" · ");
                          const line5 = item.note ? `📝 ${item.note}` : null;

                          return (
                            <div
                              key={item.cartId}
                              className="p-3.5 rounded-[1.25rem] bg-white border border-transparent shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] hover:border-border/60 transition-colors flex gap-3.5"
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
                                  <div className="flex items-center gap-2.5 bg-white border border-border shadow-sm rounded-full px-1.5 py-1 w-full justify-between">
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
                                {/* Name + delete */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-sm text-primary leading-tight truncate">
                                      {item.name} {item.category === "fusion" && powderName && `- ${powderName}`}
                                    </h4>
                                    <div className="mt-1.5 flex flex-col gap-1 items-start">
                                      {line1 && <p className="text-[11px] text-primary font-medium bg-primary/25 px-2 py-1 rounded-md">{line1}</p>}
                                      {line2 && <p className="text-[11px] text-primary/[0.95] font-medium bg-primary/20 px-2 py-1 rounded-md">{line2}</p>}
                                      {line3 && <p className="text-[11px] text-primary/90 font-medium bg-primary/15 px-2 py-1 rounded-md">{line3}</p>}
                                      {line4 && <p className="text-[11px] text-primary/[0.85] font-medium bg-primary/10 px-2 py-1 rounded-md">{line4}</p>}
                                      {line5 && <p className="text-[11px] text-primary/80 font-medium bg-primary/5 px-2 py-1 rounded-md italic">{line5}</p>}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => removeItem(item.cartId)}
                                    aria-label={`Xoá ${item.name}`}
                                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-primary/30 hover:text-red-500 hover:bg-red-50 transition-colors -mt-1 -mr-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Voucher tags / CTA and Price at the bottom */}
                                <div className="flex items-end justify-between mt-3 gap-2">
                                  <div className="flex flex-wrap gap-1.5 flex-1">
                                    {/* Applied: product voucher */}
                                    {item.productVoucherId && (() => {
                                      const pv = allVouchers.find(v => v.id === item.productVoucherId);
                                      return (
                                        <div className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full flex items-center gap-1.5">
                                          <Ticket className="w-3 h-3" /> {pv?.package?.name || "Free món"}
                                          <button
                                            onClick={() => removeProductVoucher(item.cartId)}
                                            aria-label="Bỏ voucher sản phẩm"
                                            className="hover:text-red-500 transition-colors ml-0.5"
                                          >
                                            <X size={11} />
                                          </button>
                                        </div>
                                      );
                                    })()}
                                    {/* Applied: addon vouchers */}
                                    {item.addonVouchers && item.addonVouchers.map(av => {
                                      const voucherInfo = allVouchers.find(v => v.id === av.voucherId);
                                      return (
                                        <div key={av.voucherId} className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1.5">
                                          <Ticket className="w-3 h-3" /> Free {voucherInfo?.addonOption?.label || "Topping"}
                                          <button
                                            onClick={() => removeAddonVoucher(item.cartId, av.voucherId)}
                                            aria-label="Bỏ voucher topping"
                                            className="hover:text-red-500 transition-colors ml-0.5"
                                          >
                                            <X size={11} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {/* Available vouchers CTA */}
                                    {hasAvailableVouchers && (
                                      <button
                                        onClick={() => setActiveItemForVoucher(item.cartId)}
                                        className="text-[10px] font-bold bg-orange-50 border border-orange-200 text-orange-600 px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-orange-100 transition-colors"
                                      >
                                        <Ticket className="w-3 h-3" />
                                        Chọn ưu đãi ({productVouchersForItem.length + addonVouchersForItem.length})
                                      </button>
                                    )}
                                  </div>
                                  
                                  {/* Price */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {item.originalClientPriceVnd > item.clientPriceVnd && (
                                      <span className="text-[11px] line-through text-primary/30 font-medium">
                                        {(item.originalClientPriceVnd * item.quantity) / 1000}k
                                      </span>
                                    )}
                                    <span className="font-bold text-[15px] text-primary">
                                      {(item.clientPriceVnd * item.quantity) / 1000}k
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
                <div className="border-t border-border/40 bg-white px-5 pb-4 pt-4 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.06)] space-y-3 flex flex-col">
                  {/* Guest Voucher Teaser */}
                  {!isLoggedIn && (
                    <div className="mb-2 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-orange-500" />
                        <span className="text-[11px] font-medium text-orange-800">Đăng nhập để xem & áp dụng voucher</span>
                      </div>
                      <button onClick={openLogin} className="text-[11px] px-3 py-1.5 rounded-full font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors">Đăng nhập</button>
                    </div>
                  )}

                  {/* Store closed notice */}
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

                  {/* ── DIV 1: Controls + Pricing (two-column 60/40) ── */}
                  <div className="flex gap-3 items-stretch">

                    {/* Left 60% — Pickup time + Voucher stacked vertically */}
                    <div className="flex flex-col gap-2" style={{ width: "60%" }}>

                      {/* Pickup time pill */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between bg-secondary/10 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="bg-white p-1 rounded-md shadow-sm shrink-0">
                              <Clock size={13} className="text-primary" />
                            </div>
                            <p className="text-[11px] font-bold text-primary">Giờ nhận</p>
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

                      {/* Voucher trigger pill */}
                      {isLoggedIn && (isVouchersLoading || discountVouchers.length > 0) && (
                        <button
                          onClick={() => setIsDiscountPickerOpen(true)}
                          className="flex items-center justify-between bg-orange-50 border border-orange-100 hover:bg-orange-100/80 transition-colors rounded-xl px-3 py-2.5 text-left"
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
                    </div>

                     {/* Right 40% — Tạm tính / Giảm giá / Phí ship / Tổng, aligned to bottom */}
                    <div className="flex flex-col justify-end flex-1 gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-primary/50">Tạm tính</span>
                        <span className="text-[11px] font-bold text-primary/50">{subtotalK}k</span>
                      </div>
                      
                      {discountAmount > 0 && (
                        <div className="flex items-center justify-between text-orange-600">
                          <span className="text-[11px] font-medium">Giảm giá</span>
                          <span className="text-[11px] font-bold">-{discountK.toLocaleString("vi-VN")}k</span>
                        </div>
                      )}

                      {orderType === "DELIVERY" && shippingFee !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-primary/50">Phí ship</span>
                          <span className="text-[11px] font-bold text-primary/50">{shippingK}k</span>
                        </div>
                      )}

                      {orderType === "DELIVERY" && freeshipDiscountK > 0 && (
                        <div className="flex items-center justify-between text-orange-600">
                          <span className="text-[11px] font-medium">Freeship</span>
                          <span className="text-[11px] font-bold">-{freeshipDiscountK.toLocaleString("vi-VN")}k</span>
                        </div>
                      )}
                      
                      <div className="border-t border-dashed border-border/40 my-1" />
                      
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest leading-none mb-0.5">Tổng</span>
                        <span className="font-serif text-2xl font-bold text-primary leading-none flex items-center gap-1">
                          <span className="text-xl">🐟</span> {grandTotalK}k
                        </span>
                        {isLoggedIn && finalPrice >= 10000 && (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-[2px] rounded-md mt-1">
                            +{Math.floor(finalPrice / 10000)} điểm cá
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delivery section trigger if DELIVERY selected */}
                  {orderType === "DELIVERY" && (
                    <div className="pt-2 border-t border-border/20 flex flex-col gap-1">
                      <button
                        onClick={() => setIsAddressPickerOpen(true)}
                        className="flex items-center justify-between bg-green-50 border border-green-100 hover:bg-green-100/80 transition-colors rounded-xl px-3 py-2.5 text-left"
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
                                  ? deliveryAddress.label || deliveryAddress.full_address 
                                  : "Chọn địa chỉ giao hàng"}
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={13} className="text-green-400 shrink-0 ml-1" />
                      </button>
                      {deliveryError && (
                        <p className="px-1 text-[11px] text-red-500 font-medium">{deliveryError}</p>
                      )}
                    </div>
                  )}

                  {/* ── DIV 2: Action row — Xoá (1/4) + Checkout (3/4) ── */}
                  <div className="flex gap-2 mt-2">
                    {/* Trash — flex-[1] = ~25%, left */}
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      disabled={checkout.status === "loading"}
                      aria-label="Xoá tất cả"
                      className={cn(
                        "flex-[1] py-3.5 rounded-[1.25rem] font-bold text-xs border-2 transition-all flex items-center justify-center",
                        checkout.status === "loading"
                          ? "border-border/30 text-primary/20 cursor-not-allowed"
                          : "border-border/60 text-primary/40 hover:border-red-300 hover:text-red-500 hover:bg-red-50"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Checkout — flex-[3] = ~75%, right */}
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
                        "flex-[3] py-3.5 rounded-[1.25rem] font-bold text-sm shadow-[0_4px_20px_-4px_rgba(0,0,0,0.12)] transition-all flex items-center justify-center gap-2",
                        checkout.status === "loading" || (orderType === "PICKUP" && !!pickupTime && pickupTime < minTimeStr) || isStoreClosed || (orderType === "DELIVERY" && (!deliveryAddress || shippingFee === null || !!deliveryError))
                          ? "bg-primary/60 text-white cursor-not-allowed"
                          : "bg-primary text-white hover:scale-[1.02] active:scale-[0.98]"
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
                            return (
                              <button
                                key={v.id}
                                onClick={() => {
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
                                    : "bg-white border-border hover:bg-orange-50/50 hover:border-orange-100"
                                )}
                              >
                                <div>
                                  <p className="font-bold text-sm text-primary flex items-center gap-2">
                                    <Ticket className="w-4 h-4 text-orange-500" /> {v.package.name}
                                  </p>
                                  {savings > 0 && (
                                    <p className="text-xs text-orange-600 mt-1">
                                      Giảm {(savings / 1000).toLocaleString('vi-VN')}k
                                    </p>
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
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => {
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
                          <p className="text-[11px] text-primary/50">Chọn nhiều mã — tối đa 1 mã % toàn đơn</p>
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
                      {discountVouchers.map((v) => {
                        const isSelected = selectedVoucherIds.includes(v.id);
                        // Disable a PERCENT voucher if another PERCENT is already selected
                        const isDisabled = !isSelected && v.discount_type === "PERCENT" && hasSelectedPercent;
                        const label =
                          v.discount_type === "PERCENT"
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
                                <p className="text-[10px] text-primary/40 mt-0.5">Đã chọn 1 mã giảm %</p>
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
                            -{Math.floor(estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice) / 1000).toLocaleString('vi-VN')}k
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
  );
};

export default CartDrawer;