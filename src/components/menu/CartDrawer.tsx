"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef, Profiler } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { onRenderCallback } from "@/src/utils/dev/renderProfiler";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Drawer } from "vaul";
import { X, AlertTriangle, RefreshCcw, ArrowLeft } from "lucide-react";
import { normalizeVoucherOwnerPhone, useCartStore } from "@/src/lib/store/cartStore";
import { useCheckout } from "@/src/hooks/useCheckout";
import { PriceChangedError, BundleNotEligibleError, type PriceConflict } from "@/src/services/orderService";
import { toast } from "sonner";
import { useCurrentUser, useIsLoggedIn, useIsLoggedInSynced } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useStoreStatus } from "@/src/hooks/useStoreStatus";
import { useEditModalStore } from "@/src/lib/store/editModalStore";
import { cn } from "@/src/utils/cn";
import { useRouter } from "next/navigation";
import { listMyVouchers, type MyVoucher } from "@/src/services/customerVoucherService";
import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { buildAddonVoucherMap, buildProductVoucherMap } from "@/src/utils/voucherMatchUtils";
import { filterActiveMainCartVouchers } from "@/src/utils/customerVoucherSelection";
import { filterHistoryVouchers } from "@/src/lib/utils/voucherModalHelpers";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { DeliverySection } from "@/src/components/delivery/DeliverySection";
import { useCustomerAddresses } from "@/src/hooks/useCustomerAddresses";
import { deliveryService } from "@/src/services/deliveryService";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
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
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import { projectCart, resolveCartProjectionVouchers } from "@/src/lib/utils/cartProjection";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import { projectCartTotals } from "@/src/lib/utils/bundleVoucherProjection";
import { getBundleAllocatedQuantities } from "@/src/lib/utils/bundleCartSummary";
import {
  deriveBundleSelectionState,
  deriveBundleAllocationConstraints,
  summarizeBundleCart,
} from "@/src/lib/utils/bundleVoucher";
import { getVoucherAvailabilityMessage } from "@/src/lib/utils/voucherModalHelpers";
import { useAddVoucherToCart, computeProductDiscountBenefit, computeVoucherItemPrice } from "@/src/hooks/useAddVoucherToCart";
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
  projectedItems: ProjectedCartLine[];
  walletVerified: boolean;
  walletReadOnlyReason: string;
}

function EditModalOverlay({ menuItems, menuData, allVouchers, projectedItems, walletVerified, walletReadOnlyReason }: EditModalOverlayProps) {
  const editingCartItem = useEditModalStore(s => s.editingCartItem);
  const editingAllowedSizes = useEditModalStore(s => s.editingAllowedSizes);
  const closeEdit = useEditModalStore(s => s.closeEdit);

  if (!editingCartItem) return null;
  const projectedEditingItem = projectedItems.find((item) => item.cartId === editingCartItem.cartId);
  if (!projectedEditingItem) return null;
  const menuItem = menuItems.find((candidate) => candidate.id === editingCartItem.menuItemId);
  if (!menuItem) return null;

  return (
    <ProductModal
      key="edit-modal"
      item={menuItem}
      latteItems={menuData.latte}
      milkTypes={menuData.milk_types}
      addonGroups={menuData.addon_groups}
      editingItem={projectedEditingItem}
      onClose={closeEdit}
      availableVouchers={allVouchers}
      walletVerified={walletVerified}
      walletReadOnlyReason={walletReadOnlyReason}
      allowedSizes={editingAllowedSizes}
      nested={true}
    />
  );
}

interface CartDrawerProps {
  menuData: MenuData;
  powderData: PowderApiResponse;
  /** Prevent a cached catalog from being treated as current after a failed refetch. */
  catalogUnavailable?: boolean;
}

const CartDrawer = ({ menuData, powderData, catalogUnavailable = false }: CartDrawerProps) => {
  const queryClient = useQueryClient();
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const isCartOpen = useCartStore((s) => s.isCartOpen);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const persistenceWarning = useCartStore((s) => s.persistenceWarning);
  const applyProductVoucher = useCartStore((s) => s.applyProductVoucher);
  const removeProductVoucher = useCartStore((s) => s.removeProductVoucher);
  const applyAddonVoucher = useCartStore((s) => s.applyAddonVoucher);
  const removeAddonVoucher = useCartStore((s) => s.removeAddonVoucher);
  const bundleApplications = useCartStore((s) => s.bundleApplications);
  const bundleRuntime = useCartStore((s) => s.bundleRuntime);
  const commitBundleCartDraft = useCartStore((s) => s.commitBundleCartDraft);
  const removeBundleApplication = useCartStore((s) => s.removeBundleApplication);
  const reconcileBundleApplications = useCartStore((s) => s.reconcileBundleApplications);
  const setBundleApplicationStatus = useCartStore((s) => s.setBundleApplicationStatus);
  const markBundleApplicationsVerifyFailed = useCartStore((s) => s.markBundleApplicationsVerifyFailed);
  const markBundleApplicationsUnavailable = useCartStore((s) => s.markBundleApplicationsUnavailable);


  const isLoggedIn = useIsLoggedIn();
  const isLoggedInSynced = useIsLoggedInSynced();
  const currentUser = useCurrentUser();
  const openLogin = useAuthModalStore((s) => s.openLogin);
  const openLoginWithIntent = useAuthModalStore((s) => s.openLoginWithIntent);
  const pendingAuthIntent = useAuthModalStore((s) => s.pendingIntent);
  const clearAuthIntent = useAuthModalStore((s) => s.clearIntent);
  const router = useRouter();

  const { data: storeStatus, isSuccess: isStoreStatusLoaded } = useStoreStatus();
  const isStoreClosed = isStoreStatusLoaded && storeStatus !== undefined && !storeStatus.is_open;
  const closure_note = storeStatus?.closure_note ?? null;
  const [checkout, setCheckout] = useState<CheckoutState>({ status: "idle" });
  const [pickupTime, setPickupTime] = useState<string>("");
  const [minTimeStr, setMinTimeStr] = useState<string>("");
  const [isTimeCustom, setIsTimeCustom] = useState<boolean>(false);

  // ── Voucher state ──
  const vouchersQuery = useCustomerVouchers({ enabled: isCartOpen && isLoggedInSynced });
  const packagesQuery = useVoucherPackages({ enabled: isCartOpen });

  const allVouchers = useMemo(() => vouchersQuery.data ?? [], [vouchersQuery.data]);
  const availableVoucherPackages = React.useMemo(() => (packagesQuery.data ?? []).filter((pkg) =>
    pkg.voucher_type === "DISCOUNT" ||
    pkg.voucher_type === "FREESHIP" ||
    pkg.voucher_type === "BUNDLE"
  ), [packagesQuery.data]);

  let voucherLoadState: "idle" | "loading" | "loaded" | "error" = "idle";
  if (isCartOpen && isLoggedInSynced) {
    if (vouchersQuery.isError) voucherLoadState = "error";
    else if (vouchersQuery.isLoading || vouchersQuery.isFetching) voucherLoadState = "loading";
    else if (vouchersQuery.isSuccess) voucherLoadState = "loaded";
  }
  const walletVerified = voucherLoadState === "loaded";
  const walletVerifiedForPersonalVoucherControls = !isLoggedIn || (isLoggedInSynced && walletVerified);
  const walletReadOnlyReason = isLoggedIn && !isLoggedInSynced
    ? "Phiên đăng nhập đang được đồng bộ."
    : isLoggedIn && vouchersQuery.isError
      ? "Không thể xác minh ví voucher. Hãy thử tải lại voucher."
      : "Ví voucher đang được xác minh. Vui lòng chờ một chút.";
  const visibleWalletVouchers = isLoggedInSynced ? allVouchers : [];
  const projectionVouchers = resolveCartProjectionVouchers(
    isLoggedIn ? "authenticated" : "anonymous",
    isLoggedInSynced && walletVerified,
    allVouchers,
  );
  const projectionMenuData = catalogUnavailable ? null : menuData;
  const projectionPowderData = catalogUnavailable ? null : powderData;
  /** Current catalog projection used by voucher matching and cart rendering. */
  const projectedItems = useMemo(() => projectCart({
    items,
    menuData: projectionMenuData,
    powderData: projectionPowderData,
    vouchers: projectionVouchers,
    selectedOrderVoucherTokens: [],
    bundleApplications,
    shippingFeeVnd: 0,
  }).lines, [bundleApplications, items, projectionMenuData, projectionPowderData, projectionVouchers]);

  const getItemVoucherBenefit = useCallback((item: ProjectedCartLine, voucher: MyVoucher) => {
    let benefit = voucher.covered_price_vnd ?? 0;
    if (voucher.voucher_type === "PRODUCT_DISCOUNT") {
      const menuItem = item.menuItem;
      if (!menuItem || item.configuration.size === null) return 0;
      const referencePrice = voucher.product_discount_mode === "PAY_AS_SIZE" && voucher.reference_size
        ? computeVoucherItemPrice(menuItem, voucher.reference_size, item.configuration.powderId ?? null,
            item.configuration.baseLiquidId ?? null, [], powderData.data,
            powderData.default_powder_gram, menuData.latte, menuData.milk_types, menuData.addon_groups).drinkPrice
        : null;
      benefit = computeProductDiscountBenefit(voucher, item.drinkPriceVnd, referencePrice);
    }
    return benefit;
  }, [menuData, powderData]);
  const applyItemVoucher = useCallback((cartId: string, voucher: MyVoucher): CartMutationResult => {
    if (!walletVerified) return { ok: false, code: "VOUCHER_CONFLICT", message: walletReadOnlyReason };
    const item = projectedItems.find((candidate) => candidate.cartId === cartId);
    if (!item) return { ok: false, code: "ITEM_NOT_FOUND", message: "Không tìm thấy món trong giỏ" };
    return applyProductVoucher(cartId, voucher.qr_token, getItemVoucherBenefit(item, voucher), voucher.voucher_type === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT");
  }, [applyProductVoucher, getItemVoucherBenefit, projectedItems, walletReadOnlyReason, walletVerified]);
  const removeProductVoucherIfVerified = useCallback((cartId: string): CartMutationResult => walletVerified
    ? removeProductVoucher(cartId)
    : { ok: false, code: "VOUCHER_CONFLICT", message: walletReadOnlyReason },
  [removeProductVoucher, walletReadOnlyReason, walletVerified]);
  const removeAddonVoucherIfVerified = useCallback((cartId: string, voucherId: string): CartMutationResult => walletVerified
    ? removeAddonVoucher(cartId, voucherId)
    : { ok: false, code: "VOUCHER_CONFLICT", message: walletReadOnlyReason },
  [removeAddonVoucher, walletReadOnlyReason, walletVerified]);
  const applyAddonVoucherIfVerified = useCallback((cartId: string, voucherId: string, addonOptionId: string): CartMutationResult => walletVerified
    ? applyAddonVoucher(cartId, voucherId, addonOptionId)
    : { ok: false, code: "VOUCHER_CONFLICT", message: walletReadOnlyReason },
  [applyAddonVoucher, walletReadOnlyReason, walletVerified]);
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
  const openProjectedItemEdit = useCallback((item: ProjectedCartLine, imposedSizes?: import("@/src/lib/types/menu").Size[]) => {
    const rawItem = items.find((candidate) => candidate.cartId === item.cartId);
    if (!rawItem) return;
    const walletSizes = item.lineVoucher?.kind === "PRODUCT_DISCOUNT" && item.configuration.size !== null
      ? allVouchers.find((voucher) => voucher.qr_token === item.lineVoucher?.token)?.eligible_sizes
      : undefined;
    const allowedSizes = imposedSizes
      ?? (walletSizes?.length
        ? walletSizes
        : item.lineVoucher?.kind === "PRODUCT_DISCOUNT" && item.configuration.size !== null
          ? [item.configuration.size]
          : undefined);
    openEdit(rawItem, allowedSizes);
  }, [allVouchers, items, openEdit]);
  const openVoucherLogin = useCallback(() => {
    openLoginWithIntent({ type: "open_cart_vouchers" });
  }, [openLoginWithIntent]);

  // ── Delivery state ──
  const [orderType, setOrderType] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [deliveryAddress, setDeliveryAddress] = useState<Address | null>(null);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const { data: customerAddresses = [], isLoading: isFetchingAddress } = useCustomerAddresses({
    enabled: isLoggedIn && isCartOpen && orderType === "DELIVERY",
  });

  const estimateFeeMutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) =>
      deliveryService.estimateFee(lat, lng),
  });

  // ── Points state ──
  const { data: pointsBalance = 0 } = useCustomerPoints({ enabled: isLoggedIn && isCartOpen });

  const checkoutMutation = useCheckout();

  const menuItems = [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])];
  const hasUnavailableItems = items.some(
    (item) => !menuItems.some((menuItem) => menuItem.id === item.menuItemId),
  );

  const contentRef = useRef<HTMLDivElement>(null);

  // Derived voucher lists
  const editableWalletVouchers = walletVerified ? visibleWalletVouchers : [];
  const discountVouchers = filterActiveMainCartVouchers(editableWalletVouchers, "DISCOUNT");
  const freeshipVouchers = filterActiveMainCartVouchers(editableWalletVouchers, "FREESHIP");
  const productDiscountVouchers = filterActiveMainCartVouchers(editableWalletVouchers, "PRODUCT_DISCOUNT");
  const historyVouchers = filterHistoryVouchers(visibleWalletVouchers);
  const applicableAddonVouchersMap = buildAddonVoucherMap(editableWalletVouchers, projectedItems);
  const applicableProductVouchers = buildProductVoucherMap(editableWalletVouchers, projectedItems);
  const bundleVouchers = filterActiveMainCartVouchers(visibleWalletVouchers, "BUNDLE").filter(
    (voucher) => voucher.package.bundleRule,
  );
  const cartProductVouchers = filterActiveMainCartVouchers(editableWalletVouchers, "PRODUCT");
  const cartItemVouchers = filterActiveMainCartVouchers(editableWalletVouchers, "ITEM");
  const cartAddonVouchers = filterActiveMainCartVouchers(editableWalletVouchers, "ADDON");
  const bundleCartSummary = useMemo(() => summarizeBundleCart(projectedItems), [projectedItems]);
  const bundleSelectionStates = useMemo(() => bundleApplications.map((application) => {
    const voucher = bundleVouchers.find((candidate) => candidate.qr_token === application.voucher_qr_token);
    const summary = voucher ? getBundleVoucherSummary(voucher) : null;
    const runtime = bundleRuntime[application.voucher_qr_token];
    const runtimeState = runtime?.status === "VERIFY_FAILED" || runtime?.status === "UNAVAILABLE" ||
      runtime?.status === "CONFLICT" || runtime?.status === "NO_BENEFIT"
      ? { status: "CONFLICT" as const, message: runtime.message ?? "Voucher BUNDLE cần được kiểm tra lại." }
      : runtime?.status === "NEEDS_CONFIGURATION"
        ? { status: "NEEDS_REWARD" as const, message: runtime.message ?? "Vui lòng chọn đủ quà của ưu đãi." }
        : null;
    return {
      application,
      voucher,
      summary,
      state: !walletVerified
        ? voucherLoadState === "error"
          ? { status: "PENDING" as const, message: "Chưa thể kiểm tra voucher. Hãy thử tải lại." }
          : { status: "PENDING" as const, message: "Đang kiểm tra voucher trong ví…" }
        : runtimeState ?? (summary
          ? deriveBundleSelectionState({ voucher: summary, cart: bundleCartSummary, allocations: application.reward_allocations })
          : { status: "INELIGIBLE" as const, message: "Voucher BUNDLE không còn khả dụng" }),
    };
  }), [bundleApplications, bundleCartSummary, bundleRuntime, bundleVouchers, voucherLoadState, walletVerified]);
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
      for (const allocation of [...bundle.application.qualifier_allocations, ...bundle.application.reward_allocations]) {
        const badges = grouped.get(allocation.client_line_id) ?? new Map<string, BundleAllocationBadge>();
        const current = badges.get(bundle.application.voucher_qr_token);
        badges.set(bundle.application.voucher_qr_token, {
          token: bundle.application.voucher_qr_token,
          label: bundle.voucher?.package.name ?? "Ưu đãi BUNDLE",
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
      const voucher = bundle.voucher;
      const takeUnrendered = (allocations: typeof bundle.application.reward_allocations) => projectedItems.filter((item) => {
        const isAllocated = allocations.some((allocation) => allocation.client_line_id === item.cartId);
        if (!isAllocated || rendered.has(item.cartId)) return false;
        rendered.add(item.cartId);
        return true;
      });
      const bundleProjection = voucher && walletVerified ? projectCartTotals({
        items: projectedItems, applications: [bundle.application], vouchers: [voucher], selectedVoucherIds: [], shipping_fee_vnd: 0,
      }) : null;
      return [{
        ...bundle,
        qualifierItems: takeUnrendered(bundle.application.qualifier_allocations),
        rewardItems: takeUnrendered(bundle.application.reward_allocations),
        bundleDiscountVnd: bundleProjection?.bundles.bundle_discount_vnd ?? 0,
      }];
    });
  }, [bundleSelectionStates, projectedItems, walletVerified]);
  const renderedBundleLineIds = useMemo(() => new Set(
    bundleSelectionStates
      .flatMap((bundle) => [
        ...bundle.application.qualifier_allocations,
        ...bundle.application.reward_allocations,
      ])
      .map((allocation) => allocation.client_line_id),
  ), [bundleSelectionStates]);
  const bundleAllocatedQuantitiesByCartId = useMemo(
    () => getBundleAllocatedQuantities(bundleApplications),
    [bundleApplications],
  );
  const bundleAllocatedAddonQuantities = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const application of bundleApplications) {
      for (const allocation of [...application.qualifier_allocations, ...application.reward_allocations]) {
        if (!allocation.addon_option_id) continue;
        const key = `${allocation.client_line_id}:${allocation.addon_option_id}`;
        quantities.set(key, (quantities.get(key) ?? 0) + allocation.quantity);
      }
    }
    return quantities;
  }, [bundleApplications]);
  // Client preview uses the same pure BUNDLE + order calculators as the server.
  const selectedDiscountVouchers = selectedVoucherIds.flatMap((id) => {
    const voucher = discountVouchers.find((candidate) => candidate.qr_token === id);
    return voucher ? [voucher] : [];
  });
  const selectedFreeshipVouchers = selectedVoucherIds.flatMap((id) => {
    const voucher = freeshipVouchers.find((candidate) => candidate.qr_token === id);
    return voucher ? [voucher] : [];
  });
  const cartProjection = useMemo(() => projectCart({
    items,
    menuData: projectionMenuData,
    powderData: projectionPowderData,
    vouchers: projectionVouchers,
    selectedOrderVoucherTokens: isLoggedInSynced ? selectedVoucherIds : [],
    bundleApplications,
    shippingFeeVnd: orderType === "DELIVERY" ? shippingFee ?? 0 : 0,
  }), [bundleApplications, isLoggedInSynced, items, orderType, projectionMenuData, projectionPowderData, projectionVouchers, selectedVoucherIds, shippingFee]);
  const lineBenefitsProjection = useMemo(() => projectCart({
    items,
    menuData: projectionMenuData,
    powderData: projectionPowderData,
    vouchers: projectionVouchers,
    selectedOrderVoucherTokens: [],
    bundleApplications,
    shippingFeeVnd: orderType === "DELIVERY" ? shippingFee ?? 0 : 0,
  }), [bundleApplications, items, orderType, projectionMenuData, projectionPowderData, projectionVouchers, shippingFee]);
  const bundleErrorByToken = useMemo(() => {
    const result = new Map(Object.entries(cartProjection.bundleErrorsByToken));
    for (const [token, message] of bundleConstraints.error_by_token) result.set(token, message);
    return result;
  }, [bundleConstraints.error_by_token, cartProjection.bundleErrorsByToken]);
  const totalAfterDiscountVnd = cartProjection.totals.total_vnd;
  const appliedFreeshipId = cartProjection.appliedOrderVoucherTokens.find((token) =>
    selectedFreeshipVouchers.some((voucher) => voucher.qr_token === token),
  ) ?? null;
  const checkoutRewards = {
    orderPoints: Math.floor(cartProjection.totals.total_vnd / 10_000),
    surplusPoints: Math.floor(cartProjection.totals.order_surplus_vnd / 10_000),
    totalPoints: Math.floor(cartProjection.totals.total_vnd / 10_000) + Math.floor(cartProjection.totals.order_surplus_vnd / 10_000),
  };
  const checkoutProjectionMessage = cartProjection.checkoutBlocked
    ? cartProjection.revalidating
      ? voucherLoadState === "error"
        ? "Chưa thể xác minh ví voucher. Hãy tải lại voucher rồi thử lại."
        : "Đang xác minh menu và ví voucher. Vui lòng chờ một chút."
      : cartProjection.errors[0] ?? "Giỏ hàng cần được kiểm tra lại trước khi đặt hàng."
    : null;
  const hasVoucherSelection = selectedVoucherIds.length > 0 || bundleApplications.length > 0 || items.some((item) =>
    Boolean(item.lineVoucher) || item.addonVouchers.length > 0,
  );
  const voucherOwnerKey = isLoggedInSynced && currentUser
    ? normalizeVoucherOwnerPhone(currentUser.phone)
    : null;
  const bundleOwnerKey = voucherOwnerKey ? `customer:${voucherOwnerKey}` : null;
  const bundleApplicationsWithRuntime = useMemo(() => bundleApplications.map((application) => ({
    ...application,
    ...(bundleRuntime[application.voucher_qr_token] ?? { status: "REVALIDATING" as const }),
  })), [bundleApplications, bundleRuntime]);
  const previousDeliveryOwnerKey = useRef(bundleOwnerKey);

  useEffect(() => {
    if (previousDeliveryOwnerKey.current === bundleOwnerKey) return;
    previousDeliveryOwnerKey.current = bundleOwnerKey;
    setDeliveryAddress(null);
    setDeliveryDistanceKm(null);
    setShippingFee(null);
    setDeliveryError(null);
  }, [bundleOwnerKey]);

  // Persisted applications are owned by the signed-in wallet. Cart mutations and
  // hydration revalidate each one before it can be submitted.
  useEffect(() => {
    reconcileBundleApplications(voucherOwnerKey);
  }, [items, reconcileBundleApplications, voucherOwnerKey]);

  useEffect(() => {
    if (!walletVerified) return;
    for (const bundle of bundleSelectionStates) {
      const projectedError = bundleErrorByToken.get(bundle.application.voucher_qr_token);
      const availabilityMessage = bundle.voucher
        ? getVoucherAvailabilityMessage(bundle.voucher)
        : null;
      const status = bundle.voucher && !bundle.voucher.availability.can_apply
        ? "UNAVAILABLE" as const
        : projectedError
        ? "CONFLICT" as const
        : bundle.state.status === "READY"
          ? "READY" as const
          : bundle.state.status === "INELIGIBLE" || bundle.state.status === "CONFLICT" || bundle.state.status === "STALE"
            ? "CONFLICT" as const
            : "NEEDS_CONFIGURATION" as const;
      const message = availabilityMessage ?? projectedError ?? bundle.state.message;
      const runtime = bundleRuntime[bundle.application.voucher_qr_token];
      if (runtime?.status !== status || runtime.message !== message) {
        setBundleApplicationStatus(bundle.application.voucher_qr_token, status, message);
      }
    }
  }, [bundleErrorByToken, bundleRuntime, bundleSelectionStates, setBundleApplicationStatus, walletVerified]);


  useEffect(() => {
    const updateTimes = () => {
      const minD = new Date(Date.now() + 10 * 60000);
      const defD = new Date(Date.now() + 12 * 60000);
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

  useEffect(() => {
    if (!isLoggedIn || !isCartOpen || pendingAuthIntent?.type !== "open_cart_vouchers") return;
    setIsDiscountPickerOpen(true);
    clearAuthIntent();
  }, [clearAuthIntent, isCartOpen, isLoggedIn, pendingAuthIntent]);

  // Auto-select default address when addresses load for DELIVERY
  useEffect(() => {
    if (orderType !== "DELIVERY" || deliveryAddress || !isLoggedIn || isFetchingAddress) return;
    const defaultAddr = customerAddresses.find(a => a.is_default) || customerAddresses[0];
    if (!defaultAddr) return;

    setDeliveryAddress(defaultAddr);
    setDeliveryError(null);

    if (defaultAddr.distance_km !== null) {
      const distance = defaultAddr.distance_km;
      if (distance > DELIVERY_CONFIG.MAX_RADIUS_KM) {
        setDeliveryDistanceKm(null);
        setShippingFee(null);
        setDeliveryError(`Ngoài vùng giao hàng (${distance.toFixed(1)}km / tối đa ${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`);
        return;
      }
      import("@/src/utils/pricing").then(({ calcShippingFee }) => {
        setDeliveryDistanceKm(distance);
        setShippingFee(calcShippingFee(distance));
      });
    } else {
      estimateFeeMutation.mutate(
        { lat: defaultAddr.lat, lng: defaultAddr.lng },
        {
          onSuccess: (estimate) => {
            setDeliveryDistanceKm(estimate.distance_km);
            setShippingFee(estimate.shipping_fee_vnd);
            setDeliveryError(null);
          },
          onError: (unknownError: unknown) => {
            const err = unknownError instanceof Error ? unknownError : new Error();
            setDeliveryDistanceKm(null);
            setShippingFee(null);
            setDeliveryError(err.message || "Không thể tính phí giao hàng");
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, deliveryAddress, isLoggedIn, isFetchingAddress, customerAddresses]);

  const handleCheckout = () => {
    if (cartProjection.checkoutBlocked) {
      setCheckout({
        status: "error",
        message: checkoutProjectionMessage ?? "Giỏ hàng cần được kiểm tra lại trước khi đặt hàng.",
      });
      return;
    }
    if (bundleApplications.length > 0 && voucherLoadState !== "loaded") {
      setCheckout({
        status: "error",
        message: voucherLoadState === "error"
          ? "Chưa thể kiểm tra voucher BUNDLE. Hãy tải lại voucher rồi thử lại."
          : "Đang kiểm tra voucher BUNDLE trong ví. Vui lòng chờ một chút.",
      });
      return;
    }
    const projectionError = [...bundleErrorByToken.values()][0];
    if (projectionError) {
      setCheckout({ status: "error", message: projectionError });
      return;
    }
    const persistedBlockedBundle = bundleApplicationsWithRuntime.find((application) => application.status !== "READY");
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
    if (cartProjection.checkoutBlocked) {
      setCheckout({
        status: "error",
        message: checkoutProjectionMessage ?? "Giỏ hàng cần được kiểm tra lại trước khi đặt hàng.",
      });
      return;
    }
    if (bundleApplications.length > 0 && voucherLoadState !== "loaded") {
      setCheckout({
        status: "error",
        message: voucherLoadState === "error"
          ? "Chưa thể kiểm tra voucher BUNDLE. Hãy tải lại voucher rồi thử lại."
          : "Đang kiểm tra voucher BUNDLE trong ví. Vui lòng chờ một chút.",
      });
      return;
    }
    if (hasBlockingBundleApplication(bundleApplicationsWithRuntime)) {
      const blocked = bundleApplicationsWithRuntime.find((application) => application.status !== "READY");
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

      const payloadItems = [...cartProjection.lines];

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
                bundleApplications: getReadyBundleApplications(bundleApplicationsWithRuntime).map((application) => ({
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
        let refreshedVouchers: MyVoucher[] | null = null;
        try {
          refreshedVouchers = await queryClient.fetchQuery({
            queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS,
            queryFn: listMyVouchers,
            staleTime: 0,
          });
          if (!Array.isArray(refreshedVouchers)) throw new Error("Ví voucher không hợp lệ");
        } catch {
          // Keep VERIFY_FAILED when the wallet could not be refreshed. A cached
          // absence is not evidence that the submitted BUNDLE became unavailable.
        }
        if (refreshedVouchers !== null) {
          const unavailableTokens = findUnavailableBundleTokens(submittedTokens, refreshedVouchers);
          if (unavailableTokens.length > 0) {
            markBundleApplicationsUnavailable(message, unavailableTokens);
          }
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["menu"] }),
          queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS }),
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
    bundleApplicationsWithRuntime,
    voucherLoadState,
    orderType,
    deliveryAddress,
    shippingFee,
    appliedFreeshipId,
    checkoutMutation,
    cartProjection,
    checkoutProjectionMessage,
    setCheckout,
    setPickupTime,
    setIsTimeCustom,
    setSelectedVoucherIds,
    hasUnavailableItems,
    markBundleApplicationsVerifyFailed,
    markBundleApplicationsUnavailable,
    queryClient,
  ]);

  const { addToCart: addVoucherToCart } = useAddVoucherToCart();

  /** PRODUCT/ITEM "Dùng ngay" from CartDiscountPicker — auto-add item to cart. */
  const handleUseProductVoucher = useCallback(async (voucher: MyVoucher) => {
    if (!walletVerified) return;
    const result = await addVoucherToCart(voucher);
    if (result.ok) {
      setIsDiscountPickerOpen(false);
    } else {
      const msg = result.reason === "item_unavailable"
        ? "Món này đã ngừng phục vụ"
        : result.reason === "size_unavailable"
        ? "Size trong voucher không còn khả dụng"
        : "Không thể áp dụng ưu đãi. Vui lòng thử lại.";
      import("sonner").then(m => m.toast.error(msg));
    }
  }, [addVoucherToCart, walletVerified]);

  const updateSelectedVoucherIdsIfVerified = useCallback((next: string[] | ((previous: string[]) => string[])) => {
    if (walletVerified) setSelectedVoucherIds(next);
  }, [setSelectedVoucherIds, walletVerified]);
  const requestRemoveBundleIfVerified = useCallback((token: string) => {
    if (walletVerified) setBundleTokenToRemove(token);
  }, [walletVerified]);
  const commitBundleDraftIfVerified = useCallback((draft: Parameters<typeof commitBundleCartDraft>[0]) => {
    if (!walletVerified) {
      return { ok: false as const, code: "BUNDLE_STALE" as const, message: "Ví voucher đang được xác minh lại." };
    }
    return commitBundleCartDraft(draft);
  }, [commitBundleCartDraft, walletVerified]);

  const handleRefreshVouchers = useCallback(async (): Promise<MyVoucher[]> => {
    const refreshed = await queryClient.fetchQuery({
      queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS,
      queryFn: listMyVouchers,
      staleTime: 0,
    });
    if (!Array.isArray(refreshed)) throw new Error("Ví voucher không hợp lệ");
    return refreshed;
  }, [queryClient]);

  const handleClose = useCallback(() => {
    setCartOpen(false);
    resetCheckout();
    setIsDiscountPickerOpen(false);
    setActiveItemForVoucher(null);
    setIsAddressPickerOpen(false);
    setOrderType("PICKUP");
    setDeliveryAddress(null);
    setShippingFee(null);
  }, [resetCheckout, setCartOpen]);

  /** The cart item currently being assigned a voucher. */
  const activeItem = projectedItems.find((item) => item.cartId === activeItemForVoucher);

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
          className="fixed bottom-0 left-0 right-0 h-[100dvh] mx-auto z-[71] w-full max-w-md bg-[#fdfcf7] shadow-2xl flex flex-col outline-none after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit"
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
              className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain px-5 pb-4 min-h-0"
            >
              {persistenceWarning ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" role="status">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-800">{persistenceWarning}</p>
                </div>
              ) : null}
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
                        {bundleSectionModels.map(({ application, voucher, qualifierItems, rewardItems, bundleDiscountVnd, state }) => (
                          <CartBundleSection
                            key={application.voucher_qr_token}
                            qualifierItems={qualifierItems}
                            rewardItems={rewardItems}
                            bundleRule={voucher?.package.bundleRule ?? undefined}
                            bundleName={voucher?.package.name ?? "Ưu đãi BUNDLE"}
                            bundleDiscountVnd={bundleDiscountVnd}
                            qualifierAllocations={application.qualifier_allocations}
                            rewardAllocations={application.reward_allocations}
                            errorMessage={state.status === "PENDING"
                              ? state.message
                              : bundleErrorByToken.get(application.voucher_qr_token) ?? (state.status === "READY" ? null : state.message)}
                            onRepairBundle={() => setIsDiscountPickerOpen(true)}
                            menuData={menuData}
                            powders={powderData.data}
                            milkTypes={menuData.milk_types}
                            onEditItem={openProjectedItemEdit}
                            onRemoveBundle={() => requestRemoveBundleIfVerified(application.voucher_qr_token)}
                            allowedSizesByCartId={bundleConstraints.allowed_sizes_by_line}
                            nonEditableCartIds={bundleConstraints.non_editable_line_ids}
                            allocationBadgesByCartId={bundleAllocationBadgesByCartId}
                            isVerifying={voucherLoadState !== "loaded" || !voucher?.package.bundleRule}
                          />
                        ))}
                        {/* Every cart line remains visible once, including BUNDLE allocations. */}
                        {[...projectedItems].reverse()
                          .filter((item) => !renderedBundleLineIds.has(item.cartId))
                          .map((item) => (
                          <CartItemCard
                            key={item.cartId}
                            item={item}
                            menuItem={menuItems.find(m => m.id === item.menuItemId)}
                            powderData={powderData}
                            milkTypes={menuData.milk_types}
                            allVouchers={visibleWalletVouchers}
                             walletVerified={walletVerifiedForPersonalVoucherControls}
                             voucherReadOnlyReason={walletReadOnlyReason}
                            applicableProductVouchers={applicableProductVouchers.get(item.menuItemId) || []}
                            applicableAddonVouchers={applicableAddonVouchersMap.get(item.cartId) || []}
                            onEdit={() => openProjectedItemEdit(item)}
                            onRemove={(id) => {
                              removeItem(id);
                              if (items.length === 1) setCartOpen(false);
                            }}
                            onUpdateQuantity={updateQuantity}
                            onOpenVoucherPicker={(id) => setActiveItemForVoucher(id)}
                            onRemoveProductVoucher={removeProductVoucherIfVerified}
                            onRemoveAddonVoucher={removeAddonVoucherIfVerified}
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
              openVoucherLogin={openVoucherLogin}
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
              totalDiscountVnd={cartProjection.totals.item_discount_vnd + cartProjection.totals.total_voucher_discount_vnd + cartProjection.totals.freeship_discount_vnd}
              voucherRevalidating={cartProjection.revalidating && hasVoucherSelection}
              grandTotalVnd={cartProjection.totals.grand_total_vnd}
              totalAfterDiscountVnd={totalAfterDiscountVnd}
              hasUnavailableItems={hasUnavailableItems}
              checkoutBlocked={cartProjection.checkoutBlocked}
              checkoutBlockMessage={checkoutProjectionMessage}
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
                items={projectedItems}
                applicableProductVouchers={applicableProductVouchers}
                applicableAddonVouchersMap={applicableAddonVouchersMap}
                bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
                bundleAllocatedAddonQuantities={bundleAllocatedAddonQuantities}
                onClose={() => setActiveItemForVoucher(null)}
                onApplyProductVoucher={applyItemVoucher}
                getProductVoucherSavings={getItemVoucherBenefit}
                onRemoveProductVoucher={removeProductVoucherIfVerified}
                onApplyAddonVoucher={applyAddonVoucherIfVerified}
                onRemoveAddonVoucher={removeAddonVoucherIfVerified}
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
                onUpdateSelectedVouchers={updateSelectedVoucherIdsIfVerified}
                onRefreshVouchers={handleRefreshVouchers}
                bundleVouchers={bundleVouchers}
                cart={projectedItems}
                menuData={menuData}
                powders={powderData.data}
                defaultPowderGram={powderData.default_powder_gram}
                getProductVoucherBenefit={getItemVoucherBenefit}
                onApplyProductVoucher={applyItemVoucher}
                onRemoveProductVoucher={removeProductVoucherIfVerified}
                onRemoveAddonVoucher={removeAddonVoucherIfVerified}
                bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
                bundleApplications={bundleApplications}
                bundleOwnerKey={bundleOwnerKey ?? "customer:anonymous"}
                onCommitBundleCartDraft={commitBundleDraftIfVerified}
                onRequestRemoveBundle={requestRemoveBundleIfVerified}
                productVouchers={[...cartProductVouchers, ...cartItemVouchers]}
                addonVouchers={cartAddonVouchers}
                onUseProductVoucher={handleUseProductVoucher}
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
                <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-4">
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
              if (!bundleTokenToRemove) return;
              const result = removeBundleApplication(bundleTokenToRemove);
              if (!result.ok) { toast.error(result.message); return; }
              setBundleTokenToRemove(null);
            }}
            title="Gỡ ưu đãi BUNDLE"
            message="Chỉ quà được ưu đãi tạo thêm sẽ được gỡ khỏi giỏ; các món bạn đã chọn mua vẫn được giữ lại."
            confirmLabel="Gỡ ưu đãi"
            isDestructive={true}
          />
          {/* Product Modal overlay for edit */}
          <EditModalOverlay
            menuItems={menuItems}
            menuData={menuData}
            allVouchers={visibleWalletVouchers}
            projectedItems={projectedItems}
            walletVerified={walletVerifiedForPersonalVoucherControls}
            walletReadOnlyReason={walletReadOnlyReason}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    </>
    </Profiler>
  );
};

export default CartDrawer;
