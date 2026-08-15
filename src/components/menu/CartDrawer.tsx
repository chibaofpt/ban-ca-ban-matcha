"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef, Profiler } from "react";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Drawer } from "vaul";
import { X, AlertTriangle, RefreshCcw, ArrowLeft } from "lucide-react";
import { useCartStore, useCartTotalPrice } from "@/src/lib/store/cartStore";
import { useCheckout } from "@/src/hooks/useCheckout";
import { PriceChangedError, type PriceConflict } from "@/src/services/orderService";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";
import { useEditModalStore } from "@/src/lib/store/editModalStore";
import { cn } from "@/src/utils/cn";
import { useRouter } from "next/navigation";
import { listMyVouchers, listActiveVoucherPackages, type MyVoucher, type VoucherPackage } from "@/src/services/customerVoucherService";
import { filterUsableVouchers, buildAddonVoucherMap, buildProductVoucherMap, estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { DeliverySection } from "@/src/components/delivery/DeliverySection";
import type { Address } from "@/src/lib/types/address";
import ProductModal from "@/src/components/shared/ProductModal";
import CartItemCard from "./cart/CartItemCard";
import { CartItemVoucherPicker } from "./cart/CartItemVoucherPicker";
import { CartDiscountPicker } from "./cart/CartDiscountPicker";
import { CartFooter } from "./cart/CartFooter";
import { getBundleVoucherSummary } from "./cart/CartBundleVoucherPanel";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import { deriveCheckoutRewards } from "@/src/utils/customerUx";
import { buildExtrasCartItem } from "@/src/utils/cartHelpers";
import {
  deriveBundleSelectionState,
  summarizeBundleCart,
  type BundleSelectionAllocation,
} from "@/src/lib/utils/bundleVoucher";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "price_changed"; conflicts: PriceConflict[] }
  | { status: "error"; message: string };

// ── CartDrawer ─────────────────────────────────────────────────────────────────

interface EditModalOverlayProps {
  menuItems: MenuItem[];
  menuData: MenuData;
  allVouchers: MyVoucher[];
}

function EditModalOverlay({ menuItems, menuData, allVouchers }: EditModalOverlayProps) {
  const editingCartItem = useEditModalStore(s => s.editingCartItem);
  const closeEdit = useEditModalStore(s => s.closeEdit);

  if (!editingCartItem) return null;
  const menuItem = menuItems.find((candidate) => candidate.id === editingCartItem.menuItemId);
  if (!menuItem) return null;

  return (
    <ProductModal
      key="edit-modal"
      item={menuItem}
      latteItems={menuData.latte}
      milkTypes={menuData.milk_types}
      addonGroups={menuData.addon_groups}
      editingItem={editingCartItem}
      onClose={closeEdit}
      availableVouchers={allVouchers}
      nested={true}
    />
  );
}

interface CartDrawerProps {
  menuData: MenuData;
  powderData: PowderApiResponse;
}

const CartDrawer = ({ menuData, powderData }: CartDrawerProps) => {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
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
  const [availableVoucherPackages, setAvailableVoucherPackages] = useState<VoucherPackage[]>([]);
  /** IDs of selected DISCOUNT vouchers. Server rule: max 1 PERCENT + unlimited FIXED. */
  const selectedVoucherIds = useCartStore((s) => s.selectedVoucherIds);
  const setSelectedVoucherIds = useCartStore((s) => s.setSelectedVoucherIds);
  const [selectedBundleToken, setSelectedBundleToken] = useState<string | null>(null);
  const [bundleAllocations, setBundleAllocations] = useState<BundleSelectionAllocation[]>([]);

  // ── UI overlay state ──
    const [isDiscountPickerOpen, setIsDiscountPickerOpen] = useState(false);
  const [activeItemForVoucher, setActiveItemForVoucher] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  void showClearConfirm;
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isAddressPickerOpen, setIsAddressPickerOpen] = useState(false);
  const openEdit = useEditModalStore((s) => s.openEdit);

  // ── Delivery state ──
  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [deliveryAddress, setDeliveryAddress] = useState<Address | null>(null);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);

  // ── Points state ──
  const { data: pointsBalance = 0 } = useCustomerPoints({ enabled: isLoggedIn && isCartOpen });

  const checkoutMutation = useCheckout();

  const menuItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
  const hasUnavailableItems = items.some(
    (item) => !menuItems.some((menuItem) => menuItem.id === item.menuItemId),
  );

  const contentRef = useRef<HTMLDivElement>(null);

  // Derived voucher lists
  const discountVouchers = filterUsableVouchers(allVouchers, "DISCOUNT");
  const freeshipVouchers = filterUsableVouchers(allVouchers, "FREESHIP");
  const applicableAddonVouchersMap = buildAddonVoucherMap(allVouchers, items);
  const applicableProductVouchers = buildProductVoucherMap(allVouchers, items);
  const bundleVouchers = allVouchers.filter(
    (voucher) =>
      voucher.voucher_type === "BUNDLE" &&
      voucher.status === "ACTIVE" &&
      voucher.package.bundleRule,
  );
  const selectedBundleVoucher = bundleVouchers.find(
    (voucher) => voucher.qr_token === selectedBundleToken,
  );
  const selectedBundleSummary = selectedBundleVoucher
    ? getBundleVoucherSummary(selectedBundleVoucher)
    : null;
  const bundleSelectionState = selectedBundleSummary
    ? deriveBundleSelectionState({
        voucher: selectedBundleSummary,
        cart: summarizeBundleCart(items),
        allocations: bundleAllocations,
      })
    : null;
  const addonLabels = useMemo(
    () =>
      new Map(
        menuData.addon_groups.flatMap((group) =>
          group.options.map((option) => [option.id, option.label] as const),
        ),
      ),
    [menuData.addon_groups],
  );

  // Calculate final display price using multi-voucher estimator
  const selectedDiscountVouchers = selectedVoucherIds.flatMap((id) => {
    const voucher = discountVouchers.find((candidate) => candidate.qr_token === id);
    return voucher ? [voucher] : [];
  });
  const rawDiscountAmount = estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice);
  
  // Apply rounding rules to avoid .5k decimals in UI
  const subtotalK = Math.ceil(subtotalPrice / 1000);
  const discountK = Math.floor(rawDiscountAmount / 1000); // Conservative discount display
  const finalK = Math.max(0, subtotalK - discountK);
  
  const shippingK = orderType === "DELIVERY" && shippingFee !== null ? Math.ceil(shippingFee / 1000) : 0;
  
  let freeshipDiscountK = 0;
  let appliedFreeshipId: string | null = null;
  const totalAfterDiscountVnd = Math.max(0, subtotalPrice - rawDiscountAmount);
  const productVoucherCoveredPrices = Object.fromEntries(
    allVouchers.flatMap((voucher) =>
      voucher.voucher_type === "PRODUCT" && voucher.covered_price_vnd !== null
        ? [[voucher.qr_token, voucher.covered_price_vnd] as const]
        : [],
    ),
  );
  const checkoutRewards = deriveCheckoutRewards(
    items,
    totalAfterDiscountVnd,
    productVoucherCoveredPrices,
  );
  const selectedFreeshipVouchers = selectedVoucherIds.flatMap((id) => {
    const voucher = freeshipVouchers.find((candidate) => candidate.qr_token === id);
    return voucher ? [voucher] : [];
  });
  if (orderType === "DELIVERY" && shippingFee !== null && selectedFreeshipVouchers.length > 0) {
    const bestVoucher = selectedFreeshipVouchers[0];
    const meetsMinimum =
      bestVoucher.min_order_vnd === null ||
      totalAfterDiscountVnd >= bestVoucher.min_order_vnd;
    if (meetsMinimum && (bestVoucher.covered_delivery_fee_vnd ?? 0) > 0) {
      freeshipDiscountK = Math.floor(
        Math.min(shippingFee, bestVoucher.covered_delivery_fee_vnd ?? 0) / 1000
      );
      appliedFreeshipId = bestVoucher.qr_token;
    }
  }

  const totalDiscountK = discountK + freeshipDiscountK;
  const grandTotalK = Math.max(0, finalK + shippingK - freeshipDiscountK);
  

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

  const handleToggleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    void event;
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
      setAvailableVoucherPackages([]);
      setSelectedVoucherIds([]);
      setSelectedBundleToken(null);
      setBundleAllocations([]);
      return;
    }
    Promise.all([
      listMyVouchers().catch(() => [] as MyVoucher[]),
      listActiveVoucherPackages().catch(() => [] as VoucherPackage[])
    ])
      .then(([vouchers, packages]) => {
        setAllVouchers(vouchers);
        setAvailableVoucherPackages(packages.filter((pkg) =>
          pkg.voucher_type === "DISCOUNT" ||
          pkg.voucher_type === "FREESHIP" ||
          pkg.voucher_type === "BUNDLE"
        ));
      })
  }, [isCartOpen, isLoggedIn, setSelectedVoucherIds]);

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
              } catch (unknownError: unknown) {
                const err = unknownError instanceof Error ? unknownError : new Error();
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

  const handleCheckout = () => {
    if (selectedBundleToken && bundleSelectionState?.status !== "READY") {
      setCheckout({
        status: "error",
        message: bundleSelectionState?.message ?? "Vui lòng chọn đủ quà của ưu đãi.",
      });
      return;
    }
    setShowSubmitConfirm(true);
  };

  const executeCheckout = useCallback(async () => {
    if (items.length === 0) return;
    if (hasUnavailableItems) {
      setCheckout({
        status: "error",
        message: "Vui lòng xoá món không còn phục vụ trước khi đặt hàng.",
      });
      return;
    }

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

        if (selectedDate.getTime() < minAllowedTime) {
          setCheckout({ status: "error", message: "Thời gian nhận món phải cách hiện tại ít nhất 10 phút." });
          return;
        }
        finalPickupTime = selectedDate.toISOString();
      } else {
        // Keep the default one minute beyond the 10-minute validation boundary.
        finalPickupTime = new Date(Date.now() + 11 * 60 * 1000).toISOString();
      }

      const payloadItems = [...items];

      if (orderType === "DELIVERY") {
        if (!deliveryAddress || shippingFee === null) {
          setCheckout({ status: "error", message: "Vui lòng chọn địa chỉ giao hàng hợp lệ." });
          return;
        }
      }

      await checkoutMutation.mutateAsync({
        items: payloadItems,
        options: {
          orderType,
          pickupTime: finalPickupTime,
          discountVoucherIds: selectedDiscountVouchers.map((voucher) => voucher.qr_token),
          ...(selectedBundleToken
            ? {
                bundleVoucherQrToken: selectedBundleToken,
                bundleRewardAllocations: bundleAllocations,
              }
            : {}),
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
  }, [
    items,
    clearCart,
    isLoggedIn,
    openLogin,
    router,
    setCartOpen,
    resetCheckout,
    pickupTime,
    selectedDiscountVouchers,
    selectedBundleToken,
    bundleAllocations,
    orderType,
    deliveryAddress,
    shippingFee,
    appliedFreeshipId,
    checkoutMutation,
    setCheckout,
    setPickupTime,
    setIsTimeCustom,
    setSelectedVoucherIds,
    hasUnavailableItems,
  ]);

  const handleClose = useCallback(() => {
    setCartOpen(false);
    resetCheckout();
    setSelectedVoucherIds([]);
    setSelectedBundleToken(null);
    setBundleAllocations([]);
    setIsDiscountPickerOpen(false);
    setActiveItemForVoucher(null);
    setIsAddressPickerOpen(false);
    setOrderType("PICKUP");
    setDeliveryAddress(null);
    setShippingFee(null);
  }, [setCartOpen, resetCheckout, setSelectedVoucherIds]);

  /** The cart item currently being assigned a voucher. */
  const activeItem = items.find(i => i.cartId === activeItemForVoucher);

  return (
    <Profiler id="CartDrawer" onRender={onRenderCallback}>
    <>
    <Drawer.Root 
      open={isCartOpen} 
      repositionInputs={false}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else setCartOpen(true);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-70 bg-foreground/40 backdrop-blur-sm touch-none" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[100dvh] mx-auto z-71 w-full max-w-md bg-[#fdfcf7] shadow-2xl flex flex-col outline-none after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit">
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
                      [...items].reverse().map((item) => (
                        <CartItemCard
                          key={item.cartId}
                          item={item}
                          menuItem={menuItems.find(m => m.id === item.menuItemId)}
                          powderData={powderData}
                          milkTypes={menuData.milk_types}
                          addonGroups={menuData.addon_groups}
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
              setIsDiscountPickerOpen={setIsDiscountPickerOpen}
              subtotalK={subtotalK}
              shippingK={shippingK}
              totalDiscountK={totalDiscountK}
              grandTotalK={grandTotalK}
              totalAfterDiscountVnd={totalAfterDiscountVnd}
              hasUnavailableItems={hasUnavailableItems}
              orderPoints={checkoutRewards.orderPoints}
              surplusPoints={checkoutRewards.surplusPoints}
              totalPoints={checkoutRewards.totalPoints}
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
                availableVoucherPackages={availableVoucherPackages}
                pointsBalance={pointsBalance}
                selectedVoucherIds={selectedVoucherIds}
                selectedDiscountVouchers={selectedDiscountVouchers}
                selectedFreeshipVouchers={selectedFreeshipVouchers}
                subtotalPrice={subtotalPrice}
                orderType={orderType}
                shippingFee={shippingFee}
                onClose={() => setIsDiscountPickerOpen(false)}
                onUpdateSelectedVouchers={setSelectedVoucherIds}
                onRefreshVouchers={async () => {
                  const refreshed = await listMyVouchers();
                  setAllVouchers(refreshed);
                }}
                bundleVouchers={bundleVouchers}
                cart={items}
                addonLabels={addonLabels}
                selectedBundleToken={selectedBundleToken}
                bundleAllocations={bundleAllocations}
                onBundleVoucherChange={setSelectedBundleToken}
                onBundleAllocationsChange={setBundleAllocations}
                onAddExtrasReward={(menuItemId, voucherToken) => {
                  const reward = (menuData.extras ?? []).find((item) => item.id === menuItemId);
                  return reward ? addItem(buildExtrasCartItem(reward, voucherToken)) : null;
                }}
                onRemoveTransientRewards={(voucherToken) => {
                  items
                    .filter((item) => item.bundleRewardVoucherToken === voucherToken)
                    .forEach((item) => removeItem(item.cartId));
                }}
              />
            )}
          </AnimatePresence>

          {/* ── Overlay: Address Picker ────────────────────────────────────── */}
          <AnimatePresence>
            {isAddressPickerOpen && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="absolute inset-0 z-10 bg-[#fdfcf7] flex flex-col"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-white shadow-sm z-10">
                  <button
                    onClick={() => setIsAddressPickerOpen(false)}
                    className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 text-primary" />
                  </button>
                  <h3 className="font-bold text-primary leading-tight">Chọn địa chỉ giao hàng</h3>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                  <DeliverySection
                    selectedAddressId={deliveryAddress?.id ?? null}
                    onAddressSelect={(addr, dist, fee) => {
                      setDeliveryAddress(addr);
                      setDeliveryDistanceKm(dist);
                      setShippingFee(fee);
                      setDeliveryError(null);
                      if (addr && dist !== null && fee !== null) setIsAddressPickerOpen(false);
                    }}
                    onError={(err) => setDeliveryError(err)}
                  />
                </div>
              </motion.div>
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
          {/* Product Modal overlay for edit */}
          <EditModalOverlay menuItems={menuItems} menuData={menuData} allVouchers={allVouchers} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    </>
    </Profiler>
  );
};

export default CartDrawer;
