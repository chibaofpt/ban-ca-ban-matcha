"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { QrCode, ShoppingBag } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/src/utils/cn";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import {
  fetchCustomerVouchers,
  exchangeCustomerVoucher,
  type MyVoucher,
} from "@/src/services/staffVoucherService";
import { listActiveVoucherPackages } from "@/src/services/customerVoucherService";
import { usePowderStore } from "@/src/lib/store/powderStore";
import {
  calcLattePrice,
  calcFusionPrice,
  resolveGram,
} from "@/src/utils/pricing";
import {
  useStaffCartStore,
  useStaffCartTotalPrice,
} from "@/src/lib/store/staffCartStore";
import { retainBundleRewardEffects } from "@/src/lib/store/cartStore";
import { buildExtrasCartItem } from "@/src/utils/cartHelpers";
import { computeProductDiscountBenefit, computeVoucherItemPrice } from "@/src/hooks/useAddVoucherToCart";
import ProductModal from "@/src/components/shared/ProductModal";
import { StaffCartDrawer } from "@/src/components/staff/StaffCartDrawer";
import { CustomerSelectModal } from "@/src/components/staff/CustomerSelectModal";
import { StaffProductGrid } from "@/src/components/staff/StaffProductGrid";
import { QRScannerModal } from "@/src/components/staff/QRScannerModal";
import { VoucherQRVerifyModal } from "@/src/components/staff/VoucherQRVerifyModal";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { CounterTransferPaymentModal } from "@/src/components/staff/CounterTransferPaymentModal";
import { PendingCounterTransfersLauncher } from "@/src/components/staff/PendingCounterTransfersLauncher";
import * as staffOrderService from "@/src/services/staffOrderService";
import { fetchOrdersList } from "@/src/services/staffOrdersListService";
import type { CreateStaffOrderPayload } from "@/src/services/staffOrderService";
import type { MenuItem, Size } from "@/src/lib/types/menu";
import type { BundleCreatedRewardEffect, CartItem } from "@/src/lib/types/cart";
import type { StaffOrderResult } from "@/src/lib/types/order";
import {
  deriveBundleSelectionState,
  deriveBundleAllocationConstraints,
  buildBundleApplication,
  summarizeBundleCart,
  type BundleSelectionAllocation,
} from "@/src/lib/utils/bundleVoucher";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { projectBundleApplications } from "@/src/lib/utils/bundleVoucherProjection";
import { getVoucherAvailabilityMessage } from "@/src/lib/utils/voucherModalHelpers";
import {
  findUnavailableBundleTokens,
  getBundleCheckoutAvailabilityMessage,
  getBundleCheckoutAvailabilityReason,
  getReadyBundleApplications,
  hasBlockingBundleApplication,
} from "@/src/lib/utils/bundleCheckoutError";
import {
  usePendingCounterTransfers,
  useStaffCounterCheckoutPayment,
} from "@/src/lib/hooks/useCounterTransferPayment";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildOrderItems(cart: CartItem[]): CreateStaffOrderPayload["items"] {
  return cart.map((c) => {
    const productVoucherId = c.productVoucherId;
    const addonVouchers = c.addonVouchers ?? [];

    return {
      menu_item_id: c.menuItemId,
      quantity: c.quantity,
      size: c.size,
      sweetness: c.sweetness,
      ice_option: c.iceOption,
      coldwhisk: c.coldwhisk,
      ...(c.note ? { note: c.note } : {}),
      addon_option_ids: c.selectedOptionIds,
      ...(productVoucherId ? { product_voucher_id: productVoucherId } : {}),
      ...(c.itemVoucherId ? { item_voucher_id: c.itemVoucherId } : {}),
      ...(addonVouchers.length > 0
        ? {
            addon_voucher_ids: addonVouchers.map((av) => ({
              voucher_id: av.voucherId,
              addon_option_id: av.addonOptionId,
            })),
          }
        : {}),
      ...(c.selectedPowderId ? { selected_powder_id: c.selectedPowderId } : {}),
      ...((c.selectedBaseLiquidId ?? c.selectedMilkTypeId)
        ? {
            selected_base_liquid_id:
              c.selectedBaseLiquidId ?? c.selectedMilkTypeId,
          }
        : {}),
      client_price_vnd: c.clientPriceVnd,
    };
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = "loading" | "error" | "success";

const SIZE_CARD_LABELS: Record<string, string> = {
  M: "Cá Con",
  L: "Cá Vừa",
  XL: "Cá Lớn",
};
void SIZE_CARD_LABELS;

// ── Component ─────────────────────────────────────────────────────────────────

/** Staff POS page — menu grid, cart drawer, checkout form, QR scanner. */
export default function StaffOrdersPage({
  userRole = "STAFF",
}: {
  userRole?: "STAFF" | "ADMIN";
}) {
  // ── Server data ───────────────────────────────────────────────────────
  const queryClient = useQueryClient();

  const { data: menuData, isLoading: isMenuLoading } = useQuery({
    queryKey: ["staff", "menu"],
    queryFn: fetchMenu,
  });

  const { data: pData, isLoading: isPowderLoading } = useQuery({
    queryKey: ["staff", "powders"],
    queryFn: fetchPowders,
  });

  const menuItems = useMemo(
    () =>
      menuData
        ? [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])]
        : [],
    [menuData],
  );
  const status: LoadStatus =
    isMenuLoading || isPowderLoading
      ? "loading"
      : menuData && pData
        ? "success"
        : "error";

  const loadMenu = () => {
    queryClient.invalidateQueries({ queryKey: ["staff", "menu"] });
    queryClient.invalidateQueries({ queryKey: ["staff", "powders"] });
  };

  const setPowderData = usePowderStore((s) => s.setPowderData);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  const getDisplayPrice = useCallback(
    (item: MenuItem, sizeObj: MenuItem["sizes"][0]) => {
      const isLatte = item.category === "latte";
      const defaultPowderId = isLatte
        ? item.powder?.id
        : item.resolved_default_powder_id;
      const defaultMilk =
        menuData?.milk_types.find((milk) => milk.is_default) ??
        menuData?.milk_types[0];

      const s = sizeObj.size;
      const base = sizeObj.base_price_vnd ?? 0;
      const pwd = powders.find((p) => p.id === defaultPowderId);
      const pwdPrice = pwd?.price_per_gram ?? 0;
      const gram = resolveGram(
        s,
        item.custom_powder_grams,
        pwd?.size_config ?? [],
        defaultPowderGrams,
      );

      if (isLatte) {
        return calcLattePrice({
          base_price_vnd: base,
          gram,
          powder_price_per_gram: pwdPrice,
          milk_ml: sizeObj.base_liquid_ml ?? sizeObj.milk_ml ?? 0,
          milk_price_per_ml: defaultMilk?.price_per_ml ?? 40,
        });
      } else {
        return calcFusionPrice({
          base_price_vnd: base,
          gram,
          powder_price_per_gram: pwdPrice,
          premium_latte: 0,
        });
      }
    },
    [powders, defaultPowderGrams, menuData],
  );

  // ── Modal control — only one open at a time ────────────────────────────

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [editingAllowedSizes, setEditingAllowedSizes] = useState<Size[] | undefined>(undefined);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [qrVerifyOpen, setQrVerifyOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [clearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);

  // ── QR scan state ──────────────────────────────────────────

  const [initialSearchQuery, setInitialSearchQuery] = useState("");
  const [scannedProductVoucher, setScannedProductVoucher] = useState<{
    qr_token: string;
    covered_price_vnd: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  // ── Cart & Zustand ──────────────────────────────────────────────────────────────
  const cart = useStaffCartStore((s) => s.items);
  const customerInfo = useStaffCartStore((s) => s.customerInfo);
  const setCustomerInfo = useStaffCartStore((s) => s.setCustomerInfo);
  const discountVoucher = useStaffCartStore((s) => s.discountVoucher);
  const setDiscountVoucher = useStaffCartStore((s) => s.setDiscountVoucher);
  const selectedDiscountIds = useStaffCartStore((s) => s.selectedDiscountIds);
  const toggleDiscountId = useStaffCartStore((s) => s.toggleDiscountId);
  const addItem = useStaffCartStore((s) => s.addItem);
  const insertItemAfter = useStaffCartStore((s) => s.insertItemAfter);
  const updateItem = useStaffCartStore((s) => s.updateItem);
  const removeItem = useStaffCartStore((s) => s.removeItem);
  const updateQuantity = useStaffCartStore((s) => s.updateQuantity);
  const clearCart = useStaffCartStore((s) => s.clearCart);
  const applyProductVoucher = useStaffCartStore((s) => s.applyProductVoucher);
  const removeProductVoucher = useStaffCartStore((s) => s.removeProductVoucher);
  const applyAddonVoucher = useStaffCartStore((s) => s.applyAddonVoucher);
  const removeAddonVoucher = useStaffCartStore((s) => s.removeAddonVoucher);
  const bundleApplications = useStaffCartStore((s) => s.bundleApplications);
  const commitBundleApplication = useStaffCartStore((s) => s.commitBundleApplication);
  const removeBundleApplication = useStaffCartStore((s) => s.removeBundleApplication);
  const reconcileBundleApplications = useStaffCartStore((s) => s.reconcileBundleApplications);
  const setBundleApplicationStatus = useStaffCartStore((s) => s.setBundleApplicationStatus);
  const markBundleApplicationsUnavailable = useStaffCartStore((s) => s.markBundleApplicationsUnavailable);
  const markBundleApplicationsVerifyFailed = useStaffCartStore((s) => s.markBundleApplicationsVerifyFailed);

  // ── Voucher state (list-based) ────────────────────────────────────────

  const [customerVouchers, setCustomerVouchers] = useState<MyVoucher[]>([]);

  // ── Category filter ───────────────────────────────────────────────────

  const [activeCategory, setActiveCategory] = useState("Tất cả");

  // ── Data fetching ─────────────────────────────────────────────────────

  // Sync fetched powders to Zustand
  useEffect(() => {
    if (pData) {
      setPowderData(pData);
    }
  }, [pData, setPowderData]);

  // Fetch customer vouchers when customer changes
  useEffect(() => {
    if (customerInfo?.type === "existing") {
      fetchCustomerVouchers(customerInfo.data.qr_token)
        .then(setCustomerVouchers)
        .catch(() => setCustomerVouchers([]));
    }
  }, [customerInfo]);

  const { data: voucherPackages } = useQuery({
    queryKey: ["staff", "voucherPackages"],
    queryFn: listActiveVoucherPackages,
    enabled: userRole === "ADMIN",
    staleTime: 1000 * 60 * 5,
  });

  const availableVoucherPackages = useMemo(() => {
    if (userRole !== "ADMIN" || !voucherPackages) return [];
    return voucherPackages.filter((p) => p.voucher_type === "DISCOUNT");
  }, [userRole, voucherPackages]);

  const exchangeMutation = useMutation({
    mutationFn: (packageId: string) => {
      if (customerInfo?.type !== "existing")
        throw new Error("Invalid customer");
      return exchangeCustomerVoucher(customerInfo.data.qr_token, packageId);
    },
  });

  const handleExchangeVoucher = async (packageId: string) => {
    if (customerInfo?.type !== "existing" || userRole !== "ADMIN") return;
    try {
      await exchangeMutation.mutateAsync(packageId);
      toast.success("Đổi ưu đãi thành công!");

      const pkg = availableVoucherPackages.find((p) => p.id === packageId);
      if (pkg && customerInfo?.type === "existing") {
        setCustomerInfo({
          type: "existing",
          data: {
            ...customerInfo.data,
            points_balance: customerInfo.data.points_balance - pkg.points_cost,
          },
        });
      }

      fetchCustomerVouchers(customerInfo.data.qr_token)
        .then(setCustomerVouchers)
        .catch(() => setCustomerVouchers([]));
    } catch (err: unknown) {
      const apiMessage = axios.isAxiosError<{ error?: string }>(err)
        ? err.response?.data?.error
        : null;
      toast.error(apiMessage || "Không thể đổi ưu đãi.");
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────

  const categories = useMemo(
    () => ["Tất cả", ...new Set(menuItems.map((i) => i.category))],
    [menuItems],
  );

  const visibleItems = useMemo(
    () =>
      menuItems.filter(
        (i) => activeCategory === "Tất cả" || i.category === activeCategory,
      ),
    [menuItems, activeCategory],
  );

  const subtotal = useStaffCartTotalPrice();
  const bundleCartSummary = useMemo(() => summarizeBundleCart(cart), [cart]);
  const staffBundleOwnerKey = customerInfo?.type === "existing"
    ? `staff:${customerInfo.data.qr_token}`
    : null;
  const bundleSelectionStates = useMemo(() => bundleApplications.map((application) => {
    const voucher = customerVouchers.find((candidate) => candidate.qr_token === application.voucher_qr_token);
    const summary = voucher ? getBundleVoucherSummary(voucher) : null;
    return {
      application,
      voucher,
      summary,
      state: summary
        ? deriveBundleSelectionState({ voucher: summary, cart: bundleCartSummary, allocations: application.reward_allocations })
        : { status: "INELIGIBLE" as const, message: "Voucher BUNDLE không còn khả dụng" },
    };
  }), [bundleApplications, bundleCartSummary, customerVouchers]);
  const bundleProjection = useMemo(
    () => projectBundleApplications(cart, bundleApplications, customerVouchers),
    [bundleApplications, cart, customerVouchers],
  );
  const bundleConstraints = useMemo(() => deriveBundleAllocationConstraints({
    cart: bundleCartSummary,
    applications: bundleSelectionStates.flatMap((bundle) => bundle.summary ? [{
      voucher_qr_token: bundle.application.voucher_qr_token,
      voucher: bundle.summary,
      qualifier_allocations: bundle.application.qualifier_allocations,
      reward_allocations: bundle.application.reward_allocations,
    }] : []),
  }), [bundleCartSummary, bundleSelectionStates]);
  const bundleErrorByToken = useMemo(() => {
    const result = new Map(bundleProjection.error_by_token);
    for (const [token, message] of bundleConstraints.error_by_token) result.set(token, message);
    return result;
  }, [bundleConstraints.error_by_token, bundleProjection.error_by_token]);

  useEffect(() => {
    reconcileBundleApplications(staffBundleOwnerKey);
  }, [cart, reconcileBundleApplications, staffBundleOwnerKey]);

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

  const updateBundleApplication = useCallback((
    voucher: MyVoucher,
    rewardAllocations: BundleSelectionAllocation[],
    effect?: BundleCreatedRewardEffect,
  ) => {
    if (!staffBundleOwnerKey) return;
    const summary = getBundleVoucherSummary(voucher);
    if (!summary) return;
    const previous = bundleApplications.find((application) => application.voucher_qr_token === voucher.qr_token);
    const selection = deriveBundleSelectionState({ voucher: summary, cart: bundleCartSummary, allocations: rewardAllocations });
    const payload = buildBundleApplication({ voucher: summary, cart: bundleCartSummary, rewardAllocations });
    const status = selection.status === "READY"
      ? "READY" as const
      : selection.status === "INELIGIBLE" || selection.status === "CONFLICT" || selection.status === "STALE"
        ? "CONFLICT" as const
        : "NEEDS_CONFIGURATION" as const;
    commitBundleApplication({
      voucher_qr_token: voucher.qr_token,
      owner_key: staffBundleOwnerKey,
      qualifier_allocations: payload?.qualifier_allocations ?? [],
      reward_allocations: rewardAllocations,
      created_reward_effects: retainBundleRewardEffects(previous?.created_reward_effects ?? [], rewardAllocations, effect),
      status,
      message: selection.message,
    });
  }, [bundleApplications, bundleCartSummary, commitBundleApplication, staffBundleOwnerKey]);



  // ── Cart handlers ─────────────────────────────────────────────────────

  const handleAddToCart = (item: CartItem) => {
    if (editingCartItem) {
      const isVoucherApplied =
        item.productVoucherId !== undefined ||
        item.itemVoucherId !== undefined ||
        (item.addonVouchers && item.addonVouchers.length > 0);
      if (editingCartItem.quantity > 1 && isVoucherApplied) {
        // Split logic: the edited item keeps the voucher but gets qty 1
        updateItem(editingCartItem.cartId, { ...item, quantity: 1 });
        // The remainder loses vouchers and gets the original price
        const remainderData = {
          ...item,
          quantity: editingCartItem.quantity - 1,
          clientPriceVnd: item.originalClientPriceVnd || item.unitPrice,
          unitPrice: item.originalClientPriceVnd || item.unitPrice,
          productVoucherId: undefined,
          itemVoucherId: undefined,
          productVoucherDiscountVnd: undefined,
          addonVouchers: [],
        };
        insertItemAfter(editingCartItem.cartId, remainderData);
      } else {
        updateItem(editingCartItem.cartId, item);
      }
    } else {
      addItem(item);
    }
    setSelectedItem(null);
    setEditingCartItem(null);
    setEditingAllowedSizes(undefined);
    setScannedProductVoucher(null);
  };

  const handleEditItem = (item: CartItem, allowedSizes?: Size[]) => {
    const menuItem = menuItems.find((m) => m.id === item.menuItemId);
    if (!menuItem) return;
    setEditingCartItem(item);
    setEditingAllowedSizes(allowedSizes);
    setSelectedItem(menuItem);
    // Removed setCartOpen(false) to keep cart drawer visible underneath
  };

  const handleRemove = (cartId: string) => {
    setItemToRemove(cartId);
  };

  const handleChangeQuantity = (cartId: string, newQty: number) => {
    if (newQty === 0) {
      setItemToRemove(cartId);
    } else {
      updateQuantity(cartId, newQty);
    }
  };

  const resetCheckout = useCallback(() => {
    clearCart();
    setInitialSearchQuery("");
    setCustomerVouchers([]);
    setCartOpen(false);
  }, [clearCart]);

  const handleSuccess = useCallback(() => {
    resetCheckout();
    toast.success("Đã tạo đơn hàng thành công!");
  }, [resetCheckout]);

  const pendingTransfers = usePendingCounterTransfers({
    fetchOrders: () =>
      fetchOrdersList({
        order_type: "COUNTER",
        status: "PENDING",
        mine: true,
        page: 1,
        limit: 100,
      }),
    updateStatus: staffOrderService.updateStaffOrderStatus,
  });

  const handlePendingCreated = (order: StaffOrderResult): void => {
    resetCheckout();
    pendingTransfers.selectPaymentAfterSurfaceClose(order);
  };

  const counterPayment = useStaffCounterCheckoutPayment({
    onCheckoutCompleted: handleSuccess,
    onPendingCreated: handlePendingCreated,
  });

  // ── Checkout flow ─────────────────────────────────────────────────────

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    const bundleProjectionError = [...bundleErrorByToken.values()][0];
    if (bundleProjectionError) {
      toast.error(bundleProjectionError);
      return;
    }
    const persistedBlockedBundle = bundleApplications.find((application) => application.status !== "READY");
    if (persistedBlockedBundle) {
      toast.error(
        persistedBlockedBundle.message ?? "Voucher BUNDLE cần được kiểm tra lại trước khi tạo đơn.",
      );
      return;
    }
    const incompleteBundle = bundleSelectionStates.find((bundle) => bundle.state.status !== "READY");
    if (incompleteBundle) {
      toast.error(
        incompleteBundle.state.message ?? "Vui lòng chọn đủ quà của ưu đãi.",
      );
      return;
    }

    const hasAnyVoucher =
      discountVoucher !== null ||
      selectedDiscountIds.length > 0 ||
      cart.some(
        (c) =>
          c.productVoucherId ||
          c.itemVoucherId ||
          (c.addonVouchers && c.addonVouchers.length > 0),
      ) ||
      bundleApplications.length > 0;

    if (hasAnyVoucher && customerInfo?.type === "existing") {
      if (userRole === "ADMIN") {
        setConfirmCheckoutOpen(true);
      } else {
        setQrVerifyOpen(true);
      }
    } else {
      setConfirmCheckoutOpen(true);
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: staffOrderService.createStaffOrder,
    onSuccess: (order) => {
      counterPayment.handleOrderCreated(order);
      queryClient.invalidateQueries({ queryKey: ["staff", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      if (order.skipped_vouchers && order.skipped_vouchers.length > 0) {
        toast.warning(
          `Có ${order.skipped_vouchers.length} ưu đãi bị bỏ qua do hết hạn hoặc đã sử dụng`,
        );
      }
    },
    onError: async (err: unknown) => {
      const bundleAvailabilityReason = getBundleCheckoutAvailabilityReason(err);
      const error = err as {
        response?: {
          data?: {
            error?: string;
            code?: string;
            details?: { reason?: string };
          };
        };
      };
      if (bundleAvailabilityReason) {
        const message = getBundleCheckoutAvailabilityMessage(bundleAvailabilityReason);
        const submittedTokens = useStaffCartStore.getState().bundleApplications
          .map((application) => application.voucher_qr_token);
        markBundleApplicationsVerifyFailed(message);
        const refreshedVouchers = customerInfo?.type === "existing"
          ? await fetchCustomerVouchers(customerInfo.data.qr_token).catch(() => null)
          : null;
        if (refreshedVouchers) {
          setCustomerVouchers(refreshedVouchers);
          const unavailableTokens = findUnavailableBundleTokens(submittedTokens, refreshedVouchers);
          if (unavailableTokens.length > 0) {
            markBundleApplicationsUnavailable(message, unavailableTokens);
          }
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["staff", "menu"] }),
          queryClient.invalidateQueries({ queryKey: ["staff", "powders"] }),
        ]).catch(() => undefined);
        toast.error(message);
      } else if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Tạo đơn thất bại. Vui lòng thử lại.");
      }
    },
    onSettled: () => {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    },
  });

  const handleCheckoutConfirm = async (customerQrToken?: string) => {
    if (isSubmittingRef.current) return;
    if (hasBlockingBundleApplication(bundleApplications)) {
      const blocked = bundleApplications.find((application) => application.status !== "READY");
      toast.error(blocked?.message ?? "Voucher BUNDLE cần được kiểm tra lại trước khi tạo đơn.");
      return;
    }
    isSubmittingRef.current = true;

    setConfirmCheckoutOpen(false);
    setQrVerifyOpen(false);
    setIsSubmitting(true);

    let payload: CreateStaffOrderPayload;
    const readyBundleApplications = getReadyBundleApplications(bundleApplications);
    const items = buildOrderItems(cart).map((item, index) =>
      readyBundleApplications.length > 0
        ? { ...item, client_line_id: cart[index]?.cartId }
        : item,
    );
    const discountVoucherIds = Array.from(
      new Set([
        ...(discountVoucher ? [discountVoucher.qr_token] : []),
        ...selectedDiscountIds,
      ]),
    );

    if (!customerInfo) {
      payload = { items, payment_method: counterPayment.paymentMethod };
    } else if (customerInfo.type === "existing") {
      payload = {
        phone_number: customerInfo.data.phone_number,
        payment_method: counterPayment.paymentMethod,
        items,
        ...(discountVoucherIds.length > 0
          ? { discount_voucher_ids: discountVoucherIds }
          : {}),
        ...(readyBundleApplications.length > 0
          ? {
              bundle_applications: readyBundleApplications.map((application) => ({
                voucher_qr_token: application.voucher_qr_token,
                qualifier_allocations: application.qualifier_allocations,
                reward_allocations: application.reward_allocations,
              })),
            }
          : {}),
        ...(customerQrToken ? { customer_qr_token: customerQrToken } : {}),
      };
    } else {
      payload = {
        phone_number: customerInfo.phone_number,
        customer_name: customerInfo.name,
        payment_method: counterPayment.paymentMethod,
        items,
      };
    }

    createOrderMutation.mutate(payload);
  };

  // ── QR scan handlers ──────────────────────────────────────────────────

  const handleScanUser = ({
    phone_number,
    name,
    qr_token,
  }: {
    phone_number: string;
    name?: string;
    points_balance?: number;
    qr_token?: string;
  }) => {
    setScanOpen(false);
    if (name) {
      setCustomerInfo({
        type: "existing",
        data: {
          qr_token: qr_token ?? "",
          phone_number,
          name,
          points_balance: 0,
        },
      });
      toast.success(`Đã áp dụng khách hàng: ${name}`);
    } else {
      setInitialSearchQuery(phone_number);
      setCustomerSelectOpen(true);
    }
  };

  const handleScanVoucherDiscount = (data: {
    qr_token: string;
    discount_type: "PERCENT" | "FIXED";
    discount_value: number;
  }) => {
    setDiscountVoucher(data);
    setScanOpen(false);
  };

  const handleScanVoucherProduct = ({
    qr_token,
    menu_item_id,
    covered_price_vnd,
  }: {
    qr_token: string;
    menu_item_id: string;
    covered_price_vnd: number;
  }) => {
    const item = menuItems.find((i) => i.id === menu_item_id);
    if (!item) return;
    setScannedProductVoucher({ qr_token, covered_price_vnd });
    setSelectedItem(item);
    setScanOpen(false);
  };

  // ── Voucher wrappers ──────────────────────────────────────────────────

  const handleApplyProduct = (
    cartId: string,
    voucher: import("@/src/services/staffVoucherService").MyVoucher,
  ) => {
    if (voucher.voucher_type === "ITEM" || voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "PRODUCT_DISCOUNT") {
      const cartItem = cart.find((item) => item.cartId === cartId);
      const menuItem = cartItem ? menuItems.find((item) => item.id === cartItem.menuItemId) : undefined;
      let benefit = voucher.covered_price_vnd ?? 0;
      if (voucher.voucher_type === "PRODUCT_DISCOUNT" && cartItem && menuItem && cartItem.size && menuData) {
        const referencePrice = voucher.product_discount_mode === "PAY_AS_SIZE" && voucher.reference_size
          ? computeVoucherItemPrice(menuItem, voucher.reference_size, cartItem.selectedPowderId ?? null,
              cartItem.selectedBaseLiquidId ?? cartItem.selectedMilkTypeId ?? null, [], powders,
              defaultPowderGrams, menuData.latte, menuData.milk_types, menuData.addon_groups).drinkPrice
          : null;
        benefit = computeProductDiscountBenefit(voucher, cartItem.originalClientPriceVnd - cartItem.addonsPrice, referencePrice);
      }
      applyProductVoucher(
        cartId,
        voucher.qr_token,
        benefit,
        voucher.voucher_type === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT",
      );
    }
  };

  const handleApplyAddon = (
    cartId: string,
    voucher: import("@/src/services/staffVoucherService").MyVoucher,
  ) => {
    if (voucher.addon_option_id) {
      applyAddonVoucher(cartId, voucher.qr_token, voucher.addon_option_id);
    }
  };

  // ── QR verify success (STAFF role) ────────────────────────────────────

  const handleQrVerified = (qrToken: string) => {
    setQrVerifyOpen(false);
    handleCheckoutConfirm(qrToken);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="px-4 md:px-0 py-4 space-y-4">
        {/* QR scan button */}
        <button
          id="btn-scan-qr"
          onClick={() => setScanOpen(true)}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-4 px-4 flex items-center justify-center gap-2 shadow-lg hover:bg-primary/90 transition"
        >
          <QrCode size={22} />
          <span className="font-medium">Quét QR khách hàng</span>
        </button>

        {/* Discount voucher indicator (from QR scan) */}
        {discountVoucher && (
          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 text-sm">
            <span className="text-green-700 dark:text-green-400 font-medium">
              🏷 Voucher giảm{" "}
              {discountVoucher.discount_type === "PERCENT"
                ? `${discountVoucher.discount_value}%`
                : `🐟 ${discountVoucher.discount_value / 1000} cá`}
            </span>
            <button
              onClick={() => setDiscountVoucher(null)}
              className="text-muted-foreground hover:text-foreground text-xs transition"
              aria-label="Xoá voucher"
            >
              ✕
            </button>
          </div>
        )}

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 md:mx-0 px-4 md:px-0 no-scrollbar">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={cn(
                "shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition border",
                activeCategory === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-secondary/40",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm">Đang tải menu…</p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-muted-foreground">Tải menu thất bại.</p>
            <button
              onClick={loadMenu}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Menu grid */}
        <StaffProductGrid
          items={visibleItems}
          onItemClick={setSelectedItem}
          getDisplayPrice={getDisplayPrice}
        />
      </div>

      {/* Pending-transfer launcher stays immediately left of the cart launcher. */}
      {(pendingTransfers.payments.length > 0 || cart.length > 0) && (
        <div className="fixed bottom-20 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center justify-end gap-2 md:bottom-6 md:right-6">
          <PendingCounterTransfersLauncher
            payments={pendingTransfers.payments}
            onSelect={pendingTransfers.selectPayment}
          />
          {cart.length > 0 && (
            <button
              id="btn-open-cart"
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-accent px-4 py-3 text-accent-foreground shadow-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShoppingBag
                className="h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              />
              <span className="truncate text-sm font-medium">
                {cart.length} món • 🐟 {subtotal / 1000} cá
              </span>
            </button>
          )}
        </div>
      )}

      {/* StaffCartDrawer */}
      <StaffCartDrawer
        menuData={menuData}
        powderData={pData}
        isOpen={cartOpen}
        cart={cart}
        discountVoucher={discountVoucher}
        customerInfo={customerInfo}
        isSubmitting={isSubmitting}
        paymentMethod={counterPayment.paymentMethod}
        onClose={() => setCartOpen(false)}
        onRemove={handleRemove}
        onEditItem={handleEditItem}
        onChangeQuantity={handleChangeQuantity}
        onCheckout={handleCheckoutClick}
        onPaymentMethodChange={counterPayment.setPaymentMethod}
        onOpenCustomerSelect={() => setCustomerSelectOpen(true)}
        onClearCustomer={() => {
          setCustomerVouchers([]);
          setCustomerInfo(null);
        }}
        bundleApplications={bundleApplications}
        onBundleApplicationChange={updateBundleApplication}
        onRequestRemoveBundle={removeBundleApplication}
        onAddExtrasReward={(menuItemId, voucherToken) => {
          const reward = (menuData?.extras ?? []).find(
            (item) => item.id === menuItemId,
          );
          const clientLineId = reward
            ? addItem(buildExtrasCartItem(reward, voucherToken))
            : null;
          return clientLineId
            ? { clientLineId, effect: { kind: "LINE" as const, client_line_id: clientLineId } }
            : null;
        }}
        customerVouchers={customerVouchers}
        selectedDiscountIds={selectedDiscountIds}
        onToggleDiscount={toggleDiscountId}
        availableVoucherPackages={availableVoucherPackages}
        onExchangeVoucher={handleExchangeVoucher}
        isExchanging={exchangeMutation.isPending}
        preventCloseOutside={
          customerSelectOpen ||
          confirmCheckoutOpen ||
          qrVerifyOpen ||
          !!itemToRemove ||
          clearCartConfirmOpen
        }
        onApplyProduct={handleApplyProduct}
        onRemoveProduct={removeProductVoucher}
        onApplyAddon={handleApplyAddon}
        onRemoveAddon={removeAddonVoucher}
        onClearCart={() => setClearCartConfirmOpen(true)}
        productModalNode={
          selectedItem &&
          editingCartItem && (
            <ProductModal
              key="staff-edit-modal"
              item={selectedItem}
              latteItems={menuData?.latte ?? []}
              milkTypes={menuData?.milk_types ?? []}
              addonGroups={menuData?.addon_groups ?? []}
              editingItem={editingCartItem || undefined}
              freeVoucherId={scannedProductVoucher?.qr_token}
              freeVoucherCoveredPriceVnd={
                scannedProductVoucher?.covered_price_vnd
              }
              availableVouchers={customerVouchers}
              allowedSizes={editingAllowedSizes}
              onClose={() => {
                setSelectedItem(null);
                setEditingCartItem(null);
                setEditingAllowedSizes(undefined);
                setScannedProductVoucher(null);
              }}
              onConfirm={handleAddToCart}
              nested={true}
              currentCartItems={cart}
            />
          )
        }
      />

      <CounterTransferPaymentModal
        payment={pendingTransfers.activePayment}
        isProcessing={pendingTransfers.isProcessing}
        onConfirm={pendingTransfers.confirm}
        onCancel={pendingTransfers.cancel}
        onClose={pendingTransfers.closePayment}
      />

      {/* ProductModal for adding a NEW item (rendered outside the drawer) */}
      {selectedItem && !editingCartItem && (
        <ProductModal
          key="staff-add-modal"
          item={selectedItem}
          latteItems={menuData?.latte ?? []}
          milkTypes={menuData?.milk_types ?? []}
          addonGroups={menuData?.addon_groups ?? []}
          freeVoucherId={scannedProductVoucher?.qr_token}
          freeVoucherCoveredPriceVnd={scannedProductVoucher?.covered_price_vnd}
          availableVouchers={customerVouchers}
          onClose={() => {
            setSelectedItem(null);
            setScannedProductVoucher(null);
          }}
          onConfirm={handleAddToCart}
          nested={false}
          currentCartItems={cart}
        />
      )}

      {/* CustomerSelectModal */}
      {customerSelectOpen && (
        <CustomerSelectModal
          initialQuery={initialSearchQuery}
          onClose={() => setCustomerSelectOpen(false)}
          onSelect={(info) => {
            if (info.type !== "existing") setCustomerVouchers([]);
            setCustomerInfo(info);
            setCustomerSelectOpen(false);
          }}
        />
      )}

      {/* Confirm Checkout Modal (no voucher path) */}
      <ConfirmModal
        isOpen={confirmCheckoutOpen}
        title="Xác nhận tạo đơn"
        message={`Bạn có chắc chắn muốn tạo đơn hàng này? ${
          !customerInfo ? "(Đơn khách vãng lai)" : ""
        }`}
        confirmLabel="Tạo đơn"
        cancelLabel="Huỷ"
        onConfirm={() => handleCheckoutConfirm()}
        onCancel={() => setConfirmCheckoutOpen(false)}
      />

      {/* VoucherQRVerifyModal — STAFF role only, shown when order has vouchers */}
      {qrVerifyOpen && customerInfo?.type === "existing" && (
        <VoucherQRVerifyModal
          customerInfo={customerInfo}
          onVerified={handleQrVerified}
          onClose={() => setQrVerifyOpen(false)}
        />
      )}

      {/* Confirm Remove Item Modal */}
      <ConfirmModal
        isOpen={!!itemToRemove}
        title="Xoá sản phẩm"
        message="Bạn có chắc chắn muốn xoá sản phẩm này khỏi giỏ hàng?"
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        onConfirm={() => {
          if (itemToRemove) {
            removeItem(itemToRemove);
            if (cart.length <= 1) {
              setCartOpen(false);
            }
          }
          setItemToRemove(null);
        }}
        onCancel={() => setItemToRemove(null)}
      />

      {/* Confirm Clear Cart Modal */}
      <ConfirmModal
        isOpen={clearCartConfirmOpen}
        title="Xoá toàn bộ giỏ hàng"
        message="Bạn có chắc chắn muốn xoá toàn bộ sản phẩm trong giỏ hàng?"
        confirmLabel="Xoá tất cả"
        cancelLabel="Huỷ"
        onConfirm={() => {
          clearCart();
          setCartOpen(false);
          setClearCartConfirmOpen(false);
        }}
        onCancel={() => setClearCartConfirmOpen(false)}
      />

      {/* QRScannerModal */}
      {scanOpen && (
        <QRScannerModal
          onClose={() => setScanOpen(false)}
          onScanUser={handleScanUser}
          onScanVoucherDiscount={handleScanVoucherDiscount}
          onScanVoucherProduct={handleScanVoucherProduct}
        />
      )}
    </>
  );
}
