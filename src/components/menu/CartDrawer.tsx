"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef, Profiler } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Drawer } from "vaul";
import { X, AlertTriangle, RefreshCcw, ArrowLeft } from "lucide-react";
import { retainBundleRewardEffects, useCartStore } from "@/src/lib/store/cartStore";
import { useCheckout } from "@/src/hooks/useCheckout";
import { PriceChangedError, BundleNotEligibleError, type PriceConflict } from "@/src/services/orderService";
import { toast } from "sonner";
import { useCurrentUser, useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useStoreStatusStore } from "@/src/lib/store/storeStore";
import { useEditModalStore } from "@/src/lib/store/editModalStore";
import { cn } from "@/src/utils/cn";
import { useRouter } from "next/navigation";
import { listMyVouchers, listActiveVoucherPackages, type MyVoucher, type VoucherPackage } from "@/src/services/customerVoucherService";
import { buildAddonVoucherMap, buildProductVoucherMap } from "@/src/utils/voucherMatchUtils";
import { filterActiveMainCartVouchers } from "@/src/utils/customerVoucherSelection";
import { filterHistoryVouchers } from "@/src/lib/utils/voucherModalHelpers";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { DeliverySection } from "@/src/components/delivery/DeliverySection";
import type { Address } from "@/src/lib/types/address";
import ProductModal from "@/src/components/shared/ProductModal";
import CartItemCard from "./cart/CartItemCard";
import { CartItemVoucherPicker } from "./cart/CartItemVoucherPicker";
import { CartDiscountPicker } from "./cart/CartDiscountPicker";
import { CartBundleSection, type BundleAllocationBadge } from "./cart/CartBundleSection";
import { CartFooter } from "./cart/CartFooter";
import { getBundleVoucherSummary } from "./cart/CartBundleVoucherPanel";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import { projectCartTotals } from "@/src/lib/utils/bundleVoucherProjection";
import { buildExtrasCartItem } from "@/src/utils/cartHelpers";
import {
  deriveBundleSelectionState,
  deriveBundleAllocationConstraints,
  buildBundleApplication,
  summarizeBundleCart,
} from "@/src/lib/utils/bundleVoucher";
import type { BundleCreatedRewardEffect } from "@/src/lib/types/cart";
import { getVoucherAvailabilityMessage } from "@/src/lib/utils/voucherModalHelpers";
import { computeProductDiscountBenefit, computeVoucherItemPrice } from "@/src/hooks/useAddVoucherToCart";
import {
  findUnavailableBundleTokens,
  getBundleCheckoutAvailabilityMessage,
  getReadyBundleApplications,
  hasBlockingBundleApplication,
} from "@/src/lib/utils/bundleCheckoutError";


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
  const editingAllowedSizes = useEditModalStore(s => s.editingAllowedSizes);
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
      allowedSizes={editingAllowedSizes}
      nested={true}
    />
  );
}

interface CartDrawerProps {
  menuData: MenuData;
  powderData: PowderApiResponse;
}

const CartDrawer = ({ menuData, powderData }: CartDrawerProps) => {
  const queryClient = useQueryClient();
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateItem = useCartStore((s) => s.updateItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const isCartOpen = useCartStore((s) => s.isCartOpen);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const applyProductVoucher = useCartStore((s) => s.applyProductVoucher);
  const removeProductVoucher = useCartStore((s) => s.removeProductVoucher);
  const applyAddonVoucher = useCartStore((s) => s.applyAddonVoucher);
  const removeAddonVoucher = useCartStore((s) => s.removeAddonVoucher);
  const bundleApplications = useCartStore((s) => s.bundleApplications);
  const commitBundleApplication = useCartStore((s) => s.commitBundleApplication);
  const removeBundleApplication = useCartStore((s) => s.removeBundleApplication);
  const clearBundleApplications = useCartStore((s) => s.clearBundleApplications);
  const reconcileBundleApplications = useCartStore((s) => s.reconcileBundleApplications);
  const setBundleApplicationStatus = useCartStore((s) => s.setBundleApplicationStatus);
  const markBundleApplicationsVerifyFailed = useCartStore((s) => s.markBundleApplicationsVerifyFailed);
  const markBundleApplicationsUnavailable = useCartStore((s) => s.markBundleApplicationsUnavailable);


  const isLoggedIn = useIsLoggedIn();
  const currentUser = useCurrentUser();
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
  const [voucherLoadState, setVoucherLoadState] = useState<"idle" | "loading" | "loaded">("idle");

  const getItemVoucherBenefit = useCallback((item: import("@/src/lib/types/cart").CartItem, voucher: MyVoucher) => {
    let benefit = voucher.covered_price_vnd ?? 0;
    if (voucher.voucher_type === "PRODUCT_DISCOUNT") {
      const menuItem = [...menuData.latte, ...menuData.fusion].find((candidate) => candidate.id === item.menuItemId);
      if (!menuItem || item.size === null) return 0;
      const referencePrice = voucher.product_discount_mode === "PAY_AS_SIZE" && voucher.reference_size
        ? computeVoucherItemPrice(menuItem, voucher.reference_size, item.selectedPowderId ?? null,
            item.selectedBaseLiquidId ?? item.selectedMilkTypeId ?? null, [], powderData.data,
            powderData.default_powder_gram, menuData.latte, menuData.milk_types, menuData.addon_groups).drinkPrice
        : null;
      benefit = computeProductDiscountBenefit(voucher, item.originalClientPriceVnd - item.addonsPrice, referencePrice);
    }
    return benefit;
  }, [menuData, powderData]);
  const applyItemVoucher = useCallback((cartId: string, voucher: MyVoucher) => {
    const item = items.find((candidate) => candidate.cartId === cartId);
    if (!item) return;
    applyProductVoucher(cartId, voucher.qr_token, getItemVoucherBenefit(item, voucher), voucher.voucher_type === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT");
  }, [applyProductVoucher, getItemVoucherBenefit, items]);
  const [availableVoucherPackages, setAvailableVoucherPackages] = useState<VoucherPackage[]>([]);
  /** IDs of selected DISCOUNT vouchers. Server rule: max 1 PERCENT + unlimited FIXED. */
  const selectedVoucherIds = useCartStore((s) => s.selectedVoucherIds);
  const setSelectedVoucherIds = useCartStore((s) => s.setSelectedVoucherIds);

  // ── UI overlay state ──
    const [isDiscountPickerOpen, setIsDiscountPickerOpen] = useState(false);
  const [activeItemForVoucher, setActiveItemForVoucher] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [bundleTokenToRemove, setBundleTokenToRemove] = useState<string | null>(null);
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
  const discountVouchers = filterActiveMainCartVouchers(allVouchers, "DISCOUNT");
  const freeshipVouchers = filterActiveMainCartVouchers(allVouchers, "FREESHIP");
  const productDiscountVouchers = filterActiveMainCartVouchers(allVouchers, "PRODUCT_DISCOUNT");
  const historyVouchers = filterHistoryVouchers(allVouchers);
  const applicableAddonVouchersMap = buildAddonVoucherMap(allVouchers, items);
  const applicableProductVouchers = buildProductVoucherMap(allVouchers, items);
  const bundleVouchers = filterActiveMainCartVouchers(allVouchers, "BUNDLE").filter(
    (voucher) => voucher.package.bundleRule,
  );
  const bundleCartSummary = useMemo(() => summarizeBundleCart(items), [items]);
  const bundleSelectionStates = useMemo(() => bundleApplications.map((application) => {
    const voucher = bundleVouchers.find((candidate) => candidate.qr_token === application.voucher_qr_token);
    const summary = voucher ? getBundleVoucherSummary(voucher) : null;
    return {
      application,
      voucher,
      summary,
      state: summary
        ? deriveBundleSelectionState({ voucher: summary, cart: bundleCartSummary, allocations: application.reward_allocations })
        : { status: "INELIGIBLE" as const, message: "Voucher BUNDLE không còn khả dụng" },
    };
  }), [bundleApplications, bundleCartSummary, bundleVouchers]);
  const bundleConstraints = useMemo(() => deriveBundleAllocationConstraints({
    cart: bundleCartSummary,
    applications: bundleSelectionStates.flatMap((bundle) => bundle.summary ? [{
      voucher_qr_token: bundle.application.voucher_qr_token,
      voucher: bundle.summary,
      qualifier_allocations: bundle.application.qualifier_allocations,
      reward_allocations: bundle.application.reward_allocations,
    }] : []),
  }), [bundleCartSummary, bundleSelectionStates]);
  const bundleAllocationBadgesByCartId = useMemo(() => {
    const grouped = new Map<string, Map<string, BundleAllocationBadge>>();
    for (const bundle of bundleSelectionStates) {
      if (!bundle.voucher?.package.bundleRule) continue;
      for (const allocation of [...bundle.application.qualifier_allocations, ...bundle.application.reward_allocations]) {
        const badges = grouped.get(allocation.client_line_id) ?? new Map<string, BundleAllocationBadge>();
        const current = badges.get(bundle.application.voucher_qr_token);
        badges.set(bundle.application.voucher_qr_token, {
          token: bundle.application.voucher_qr_token,
          label: bundle.voucher.package.name,
          quantity: (current?.quantity ?? 0) + allocation.quantity,
        });
        grouped.set(allocation.client_line_id, badges);
      }
    }
    return new Map([...grouped.entries()].map(([lineId, badges]) => [lineId, [...badges.values()]]));
  }, [bundleSelectionStates]);
  const bundleSectionModels = useMemo(() => {
    const rendered = new Set<string>();
    return bundleSelectionStates.flatMap((bundle) => {
      if (!bundle.voucher?.package.bundleRule) return [];
      const takeUnrendered = (allocations: typeof bundle.application.reward_allocations) => items.filter((item) => {
        const isAllocated = allocations.some((allocation) => !allocation.addon_option_id && allocation.client_line_id === item.cartId);
        if (!isAllocated || rendered.has(item.cartId)) return false;
        rendered.add(item.cartId);
        return true;
      });
      return [{ ...bundle, qualifierItems: takeUnrendered(bundle.application.qualifier_allocations), rewardItems: takeUnrendered(bundle.application.reward_allocations) }];
    });
  }, [bundleSelectionStates, items]);
  const renderedBundleLineIds = useMemo(() => new Set(
    bundleSelectionStates
      .filter((bundle) => bundle.voucher?.package.bundleRule)
      .flatMap((bundle) => [
        ...bundle.application.qualifier_allocations,
        ...bundle.application.reward_allocations,
      ])
      .map((allocation) => allocation.client_line_id),
  ), [bundleSelectionStates]);
  const addonLabels = useMemo(
    () =>
      new Map(
        menuData.addon_groups.flatMap((group) =>
          group.options.map((option) => [option.id, option.label] as const),
        ),
      ),
    [menuData.addon_groups],
  );
  const updateBundleApplication = useCallback((
    voucher: MyVoucher,
    rewardAllocations: import("@/src/lib/utils/bundleVoucher").BundleSelectionAllocation[],
    effects: BundleCreatedRewardEffect[] = [],
  ) => {
    const summary = getBundleVoucherSummary(voucher);
    if (!summary) return { ok: false as const, error: "Voucher BUNDLE không còn khả dụng" };
    const previous = bundleApplications.find((application) => application.voucher_qr_token === voucher.qr_token);
    const latestCart = summarizeBundleCart(useCartStore.getState().items);
    const selection = deriveBundleSelectionState({ voucher: summary, cart: latestCart, allocations: rewardAllocations });
    const payload = buildBundleApplication({ voucher: summary, cart: latestCart, rewardAllocations });
    if (selection.status !== "READY" || !payload) {
      return { ok: false as const, error: selection.message };
    }
    commitBundleApplication({
      voucher_qr_token: voucher.qr_token,
      owner_key: `customer:${currentUser?.phone ?? "anonymous"}`,
      qualifier_allocations: payload?.qualifier_allocations ?? [],
      reward_allocations: rewardAllocations,
      created_reward_effects: effects.reduce(
        (retained, effect) => retainBundleRewardEffects(retained, rewardAllocations, effect),
        retainBundleRewardEffects(previous?.created_reward_effects ?? [], rewardAllocations),
      ),
      status: "READY",
      message: selection.message,
    });
    return { ok: true as const };
  }, [bundleApplications, commitBundleApplication, currentUser?.phone]);

  // Client preview uses the same pure BUNDLE + order calculators as the server.
  const selectedDiscountVouchers = selectedVoucherIds.flatMap((id) => {
    const voucher = discountVouchers.find((candidate) => candidate.qr_token === id);
    return voucher ? [voucher] : [];
  });
  const selectedFreeshipVouchers = selectedVoucherIds.flatMap((id) => {
    const voucher = freeshipVouchers.find((candidate) => candidate.qr_token === id);
    return voucher ? [voucher] : [];
  });
  const cartProjection = useMemo(() => projectCartTotals({
    items,
    applications: bundleApplications,
    vouchers: allVouchers,
    selectedVoucherIds,
    shipping_fee_vnd: orderType === "DELIVERY" ? shippingFee ?? 0 : 0,
  }), [allVouchers, bundleApplications, items, orderType, selectedVoucherIds, shippingFee]);
  const lineBenefitsProjection = useMemo(() => projectCartTotals({
    items,
    applications: bundleApplications,
    vouchers: allVouchers,
    selectedVoucherIds: [],
    shipping_fee_vnd: orderType === "DELIVERY" ? shippingFee ?? 0 : 0,
  }), [allVouchers, bundleApplications, items, orderType, shippingFee]);
  const bundleErrorByToken = useMemo(() => {
    const result = new Map(cartProjection.bundles.error_by_token);
    for (const [token, message] of bundleConstraints.error_by_token) result.set(token, message);
    return result;
  }, [bundleConstraints.error_by_token, cartProjection.bundles.error_by_token]);
  const totalAfterDiscountVnd = cartProjection.totals.total_vnd;
  const appliedFreeshipId = cartProjection.totals.appliedVoucherIds.find((token) =>
    selectedFreeshipVouchers.some((voucher) => voucher.qr_token === token),
  ) ?? null;
  const checkoutRewards = {
    orderPoints: Math.floor(cartProjection.totals.total_vnd / 10_000),
    surplusPoints: Math.floor(cartProjection.totals.order_surplus_vnd / 10_000),
    totalPoints: Math.floor(cartProjection.totals.total_vnd / 10_000) + Math.floor(cartProjection.totals.order_surplus_vnd / 10_000),
  };
  const bundleOwnerKey = isLoggedIn && currentUser ? `customer:${currentUser.phone}` : null;

  // Persisted applications are owned by the signed-in wallet. Cart mutations and
  // hydration revalidate each one before it can be submitted.
  useEffect(() => {
    reconcileBundleApplications(bundleOwnerKey);
  }, [bundleOwnerKey, items, reconcileBundleApplications]);

  useEffect(() => {
    for (const bundle of bundleSelectionStates) {
      const projectedError = bundleErrorByToken.get(bundle.application.voucher_qr_token);
      const availabilityMessage = bundle.voucher
        ? getVoucherAvailabilityMessage(bundle.voucher)
        : null;
      const persistedBlockedStatus = bundle.application.status === "UNAVAILABLE" || bundle.application.status === "VERIFY_FAILED"
        ? bundle.application.status
        : null;
      const status = persistedBlockedStatus
        ? persistedBlockedStatus
        : bundle.voucher && !bundle.voucher.availability.can_apply
        ? "UNAVAILABLE" as const
        : projectedError
        ? "CONFLICT" as const
        : bundle.state.status === "READY"
          ? "READY" as const
          : bundle.state.status === "INELIGIBLE" || bundle.state.status === "CONFLICT" || bundle.state.status === "STALE"
            ? "CONFLICT" as const
            : "NEEDS_CONFIGURATION" as const;
      const message = persistedBlockedStatus
        ? bundle.application.message
        : availabilityMessage ?? projectedError ?? bundle.state.message;
      if (bundle.application.status !== status || bundle.application.message !== message) {
        setBundleApplicationStatus(bundle.application.voucher_qr_token, status, message);
      }
    }
  }, [bundleErrorByToken, bundleSelectionStates, setBundleApplicationStatus]);


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
      setVoucherLoadState("idle");
      setSelectedVoucherIds([]);
      if (!isLoggedIn) clearBundleApplications();
      return;
    }
    let cancelled = false;
    setVoucherLoadState("loading");
    void Promise.all([
      listMyVouchers().catch(() => [] as MyVoucher[]),
      listActiveVoucherPackages().catch(() => [] as VoucherPackage[])
    ])
      .then(([vouchers, packages]) => {
        if (cancelled) return;
        setAllVouchers(vouchers);
        setAvailableVoucherPackages(packages.filter((pkg) =>
          pkg.voucher_type === "DISCOUNT" ||
          pkg.voucher_type === "FREESHIP" ||
          pkg.voucher_type === "BUNDLE"
        ));
      })
      .finally(() => {
        if (!cancelled) setVoucherLoadState("loaded");
      });
    return () => { cancelled = true; };
  }, [isCartOpen, isLoggedIn, setSelectedVoucherIds, clearBundleApplications]);

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
    const projectionError = [...bundleErrorByToken.values()][0];
    if (projectionError) {
      setCheckout({ status: "error", message: projectionError });
      return;
    }
    const persistedBlockedBundle = bundleApplications.find((application) => application.status !== "READY");
    if (persistedBlockedBundle) {
      setCheckout({
        status: "error",
        message: persistedBlockedBundle.message ?? "Voucher BUNDLE cần được kiểm tra lại trước khi đặt hàng.",
      });
      return;
    }
    const incompleteBundle = bundleSelectionStates.find((bundle) => bundle.state.status !== "READY");
    if (incompleteBundle) {
      setCheckout({
        status: "error",
        message: incompleteBundle.state.message ?? "Vui lòng chọn đủ quà của ưu đãi.",
      });
      return;
    }
    setShowSubmitConfirm(true);
  };

  const executeCheckout = useCallback(async () => {
    if (items.length === 0) return;
    if (hasBlockingBundleApplication(bundleApplications)) {
      const blocked = bundleApplications.find((application) => application.status !== "READY");
      setCheckout({
        status: "error",
        message: blocked?.message ?? "Voucher BUNDLE cần được kiểm tra lại trước khi đặt hàng.",
      });
      return;
    }
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

      const orderResult = await checkoutMutation.mutateAsync({
        items: payloadItems,
        options: {
          orderType,
          pickupTime: finalPickupTime,
          discountVoucherIds: selectedDiscountVouchers.map((voucher) => voucher.qr_token),
          ...(bundleApplications.length > 0
            ? {
                bundleApplications: getReadyBundleApplications(bundleApplications).map((application) => ({
                  voucher_qr_token: application.voucher_qr_token,
                  qualifier_allocations: application.qualifier_allocations,
                  reward_allocations: application.reward_allocations,
                })),
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
      if (orderResult.skipped_vouchers.length > 0) {
        toast.info("Voucher không tạo thêm lợi ích lần này và vẫn còn hiệu lực để dùng sau.");
      }
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
      } else if (err instanceof BundleNotEligibleError) {
        const message = getBundleCheckoutAvailabilityMessage(err.reason);
        const submittedTokens = bundleApplications.map((application) => application.voucher_qr_token);
        markBundleApplicationsVerifyFailed(message);
        const refreshedVouchers = await listMyVouchers().catch(() => null);
        if (refreshedVouchers) {
          setAllVouchers(refreshedVouchers);
          const unavailableTokens = findUnavailableBundleTokens(submittedTokens, refreshedVouchers);
          if (unavailableTokens.length > 0) {
            markBundleApplicationsUnavailable(message, unavailableTokens);
          }
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["menu"] }),
          queryClient.invalidateQueries({ queryKey: ["customer", "vouchers"] }),
          queryClient.invalidateQueries({ queryKey: ["my_vouchers"] }),
        ]);
        setCheckout({ status: "error", message });
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
    bundleApplications,
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
    markBundleApplicationsVerifyFailed,
    markBundleApplicationsUnavailable,
    queryClient,
  ]);

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
        <Drawer.Content
          onInteractOutside={(event) => {
            if (document.querySelector('[data-prevent-drawer-close="true"]')) {
              event.preventDefault();
            }
          }}
          className="fixed bottom-0 left-0 right-0 h-[100dvh] mx-auto z-71 w-full max-w-md bg-[#fdfcf7] shadow-2xl flex flex-col outline-none after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit"
        >
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
                      <>
                        {/* Each application is rendered independently; paid rows stay in the main cart. */}
                        {bundleSectionModels.flatMap(({ application, voucher, qualifierItems, rewardItems }) => voucher?.package.bundleRule ? [
                          <CartBundleSection
                            key={application.voucher_qr_token}
                            qualifierItems={qualifierItems}
                            rewardItems={rewardItems}
                            bundleRule={voucher.package.bundleRule}
                            menuData={menuData}
                            powders={powderData.data}
                            milkTypes={menuData.milk_types}
                            defaultPowderGram={powderData.default_powder_gram}
                            onEditItem={(item, allowedSizes) => openEdit(item, allowedSizes)}
                            onSwapItem={(oldCartId, newData) => updateItem(oldCartId, newData)}
                            onRemoveBundle={() => setBundleTokenToRemove(application.voucher_qr_token)}
                            allowedSizesByCartId={bundleConstraints.allowed_sizes_by_line}
                            nonEditableCartIds={bundleConstraints.non_editable_line_ids}
                            allocationBadgesByCartId={bundleAllocationBadgesByCartId}
                          />,
                        ] : [])}
                        {/* Every cart line remains visible once, including BUNDLE allocations. */}
                        {[...items].reverse()
                          .filter((item) => !renderedBundleLineIds.has(item.cartId))
                          .map((item) => (
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
                        ))}
                      </>
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
              subtotalVnd={cartProjection.totals.subtotal_vnd}
              shippingVnd={cartProjection.totals.shipping_fee_vnd}
              totalDiscountVnd={cartProjection.totals.items_discount_vnd + cartProjection.totals.total_voucher_discount_vnd + cartProjection.totals.freeship_discount_vnd}
              grandTotalVnd={cartProjection.totals.grand_total_vnd}
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
                onApplyProductVoucher={applyItemVoucher}
                getProductVoucherSavings={getItemVoucherBenefit}
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
                productDiscountVouchers={productDiscountVouchers}
                historyVouchers={historyVouchers}
                availableVoucherPackages={availableVoucherPackages}
                pointsBalance={pointsBalance}
                isLoading={voucherLoadState !== "loaded"}
                selectedVoucherIds={selectedVoucherIds}
                selectedDiscountVouchers={selectedDiscountVouchers}
                selectedFreeshipVouchers={selectedFreeshipVouchers}
                subtotalPrice={lineBenefitsProjection.totals.discountable_subtotal_vnd}
                orderType={orderType}
                shippingFee={shippingFee}
                onClose={() => setIsDiscountPickerOpen(false)}
                onUpdateSelectedVouchers={setSelectedVoucherIds}
                onRefreshVouchers={async () => {
                  setVoucherLoadState("loading");
                  try {
                    const refreshed = await listMyVouchers();
                    setAllVouchers(refreshed);
                  } finally {
                    setVoucherLoadState("loaded");
                  }
                }}
                bundleVouchers={bundleVouchers}
                cart={items}
                menuData={menuData}
                powders={powderData.data}
                defaultPowderGram={powderData.default_powder_gram}
                getProductVoucherBenefit={getItemVoucherBenefit}
                onApplyProductVoucher={applyItemVoucher}
                onRemoveProductVoucher={removeProductVoucher}
                bundleAllocatedCartIds={renderedBundleLineIds}
                addonLabels={addonLabels}
                bundleApplications={bundleApplications}
                onBundleApplicationChange={updateBundleApplication}
                onRequestRemoveBundle={setBundleTokenToRemove}
                onAddExtrasReward={(menuItemId, voucherToken) => {
                  const reward = (menuData.extras ?? []).find((item) => item.id === menuItemId);
                  const clientLineId = reward ? addItem(buildExtrasCartItem(reward, voucherToken)) : null;
                  return clientLineId ? { clientLineId, effect: { kind: "LINE" as const, client_line_id: clientLineId } } : null;
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
            isOpen={showClearConfirm}
            onCancel={() => setShowClearConfirm(false)}
            onConfirm={() => {
              clearCart();
              setShowClearConfirm(false);
              window.requestAnimationFrame(handleClose);
            }}
            title="Xoá giỏ hàng"
            message="Bạn có chắc chắn muốn xoá toàn bộ món trong giỏ không?"
            confirmLabel="Xoá giỏ"
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
          <ConfirmModal
            isOpen={bundleTokenToRemove !== null}
            onCancel={() => setBundleTokenToRemove(null)}
            onConfirm={() => {
              if (bundleTokenToRemove) removeBundleApplication(bundleTokenToRemove);
              setBundleTokenToRemove(null);
            }}
            title="Gỡ ưu đãi BUNDLE"
            message="Chỉ quà được ưu đãi tạo thêm sẽ được gỡ khỏi giỏ; các món bạn đã chọn mua vẫn được giữ lại."
            confirmLabel="Gỡ ưu đãi"
            isDestructive={true}
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
