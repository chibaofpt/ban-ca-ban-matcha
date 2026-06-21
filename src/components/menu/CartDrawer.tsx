"use client";

import React, { useState, useCallback, useEffect, useRef, Profiler } from "react";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import { X, Trash2, ShoppingBag, CheckCircle2, AlertTriangle, RefreshCcw, Minus, Plus, Ticket, ChevronRight, Clock, ArrowLeft, MapPin } from "lucide-react";
import { useCartStore, useCartTotalPrice } from "@/src/lib/store/cartStore";
import Image from "next/image";
import { useCheckout } from "@/src/hooks/useCheckout";
import { PriceChangedError, type PriceConflict } from "@/src/services/orderService";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";
import { useEditModalStore } from "@/src/lib/store/editModalStore";
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
import CartItemCard from "./cart/CartItemCard";
import { CartItemVoucherPicker } from "./cart/CartItemVoucherPicker";
import { CartDiscountPicker } from "./cart/CartDiscountPicker";
import { CartFooter } from "./cart/CartFooter";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "price_changed"; conflicts: PriceConflict[] }
  | { status: "error"; message: string };

// ── CartDrawer ─────────────────────────────────────────────────────────────────

function EditModalOverlay({ menuItems, latteItems, allVouchers }: { menuItems: any[], latteItems: any[], allVouchers: any[] }) {
  const editingCartItem = useEditModalStore(s => s.editingCartItem);
  const closeEdit = useEditModalStore(s => s.closeEdit);

  if (!editingCartItem) return null;
  const menuItem = menuItems.find((m: any) => m.id === editingCartItem.menuItemId);
  if (!menuItem) return null;

  return (
    <ProductModal
      key="edit-modal"
      item={menuItem}
      latteItems={latteItems}
      editingItem={editingCartItem}
      onClose={closeEdit}
      availableVouchers={allVouchers}
      nested={true}
    />
  );
}

const CartDrawer = () => {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const isCartOpen = useCartStore((s) => s.isCartOpen);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const applyProductVoucher = useCartStore((s) => s.applyProductVoucher);
  const removeProductVoucher = useCartStore((s) => s.removeProductVoucher);
  const applyAddonVoucher = useCartStore((s) => s.applyAddonVoucher);
  const removeAddonVoucher = useCartStore((s) => s.removeAddonVoucher);

  const subtotalPrice = useCartTotalPrice();
  const isLoggedIn = useIsLoggedIn();
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const router = useRouter();

  const isStoreOpen = useStoreStatusStore((s) => s.is_open);
  const isStoreStatusLoaded = useStoreStatusStore((s) => s.isLoaded);
  const closure_note = useStoreStatusStore((s) => s.closure_note);
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
  const openEdit = useEditModalStore((s) => s.openEdit);

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

  const contentRef = useRef<HTMLDivElement>(null);

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
    <Profiler id="CartDrawer" onRender={onRenderCallback}>
    <>
    <Drawer.Root 
      open={isCartOpen} 
      onOpenChange={(open) => {
        if (!open) handleClose();
        else setCartOpen(true);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-70 bg-foreground/40 backdrop-blur-sm touch-none" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[100dvh] mx-auto z-71 w-full max-w-md bg-[#fdfcf7] shadow-2xl flex flex-col overflow-hidden outline-none">
          {/* ── Main cart view ───────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden relative">

            {/* Mobile Drag Handle */}
            <div className="flex justify-center pt-2 pb-1 w-full shrink-0 touch-none bg-white/60 backdrop-blur-md">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-0 pb-2 border-b border-border/40 shrink-0 bg-white/60 backdrop-blur-md touch-none">
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
                      items.map((item) => (
                        <CartItemCard
                          key={item.cartId}
                          item={item}
                          menuItem={menuItems.find(m => m.id === item.menuItemId)}
                          powderData={powderData}
                          allVouchers={allVouchers}
                          applicableProductVouchers={applicableProductVouchers.get(item.menuItemId) || []}
                          applicableAddonVouchers={applicableAddonVouchersMap.get(item.cartId) || []}
                          onEdit={() => openEdit(item)}
                          onRemove={(id) => {
                            removeItem(id);
                            if (items.length === 1) setCartOpen(false);
                          }}
                          onUpdateQuantity={updateQuantity}
                          onOpenVoucherPicker={(id) => setActiveItemForVoucher(id)}
                          onRemoveProductVoucher={removeProductVoucher}
                          onRemoveAddonVoucher={removeAddonVoucher}
                        />
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <CartFooter
              itemsLength={items.length}
              isLoggedIn={isLoggedIn}
              openLogin={openLogin}
              isStoreClosed={isStoreClosed}
              closure_note={closure_note}
              orderType={orderType}
              setOrderType={setOrderType}
              pickupTime={pickupTime}
              setPickupTime={setPickupTime}
              minTimeStr={minTimeStr}
              setIsTimeCustom={setIsTimeCustom}
              handleToggleDragEnd={handleToggleDragEnd}
              isFetchingAddress={isFetchingAddress}
              deliveryAddress={deliveryAddress}
              deliveryDistanceKm={deliveryDistanceKm}
              deliveryError={deliveryError}
              shippingFee={shippingFee}
              setIsAddressPickerOpen={setIsAddressPickerOpen}
              productVouchersCount={items.reduce((sum, item) => sum + (applicableProductVouchers.get(item.menuItemId)?.length || 0), 0)}
              addonVouchersCount={items.reduce((sum, item) => sum + (applicableAddonVouchersMap.get(item.cartId)?.length || 0), 0)}
              subtotalK={subtotalK}
              shippingK={shippingK}
              totalDiscountK={totalDiscountK}
              grandTotalK={grandTotalK}
              finalPrice={finalPrice}
              checkout={checkout}
              handleCheckout={handleCheckout}
              setShowClearConfirm={setShowClearConfirm}
            />
          </div>

          {/* ── Overlay: Item Voucher Picker ─────────────────────────────── */}
          <AnimatePresence>
            {activeItemForVoucher && activeItem && (
              <CartItemVoucherPicker
                activeItem={activeItem}
                items={items}
                applicableProductVouchers={applicableProductVouchers}
                applicableAddonVouchersMap={applicableAddonVouchersMap}
                onClose={() => setActiveItemForVoucher(null)}
                onApplyProductVoucher={applyProductVoucher}
                onRemoveProductVoucher={removeProductVoucher}
                onApplyAddonVoucher={applyAddonVoucher}
                onRemoveAddonVoucher={removeAddonVoucher}
              />
            )}
          </AnimatePresence>

          {/* ── Overlay: Discount Voucher Picker (multi-select) ───────────── */}
          <AnimatePresence>
            {isDiscountPickerOpen && (
              <CartDiscountPicker
                discountVouchers={discountVouchers}
                freeshipVouchers={freeshipVouchers}
                selectedVoucherIds={selectedVoucherIds}
                selectedDiscountVouchers={selectedDiscountVouchers}
                selectedFreeshipVouchers={selectedFreeshipVouchers}
                subtotalPrice={subtotalPrice}
                orderType={orderType}
                shippingFee={shippingFee}
                onClose={() => setIsDiscountPickerOpen(false)}
                onUpdateSelectedVouchers={setSelectedVoucherIds}
              />
            )}
          </AnimatePresence>

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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>

    {/* Product Modal overlay for edit */}
    <EditModalOverlay menuItems={menuItems} latteItems={menuData?.latte ?? []} allVouchers={allVouchers} />
    </>
    </Profiler>
  );
};

export default CartDrawer;