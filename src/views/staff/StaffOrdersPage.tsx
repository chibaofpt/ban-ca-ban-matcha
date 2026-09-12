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
import ProductModal from "@/src/components/shared/ProductModal";
import { StaffCartDrawer } from "@/src/components/staff/StaffCartDrawer";
import { CustomerSelectModal } from "@/src/components/staff/CustomerSelectModal";
import { StaffProductGrid } from "@/src/components/staff/StaffProductGrid";
import { QRScannerModal } from "@/src/components/staff/QRScannerModal";
import { VoucherQRVerifyModal } from "@/src/components/staff/VoucherQRVerifyModal";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { CounterTransferPaymentModal } from "@/src/components/staff/CounterTransferPaymentModal";
import { PendingCounterTransfersLauncher } from "@/src/components/staff/PendingCounterTransfersLauncher";
import * as staffOrderService from "@/src/services/staffOrderService";
import { fetchOrdersList } from "@/src/services/staffOrdersListService";
import type { CreateStaffOrderPayload } from "@/src/services/staffOrderService";
import type { ScannedVoucherMenuTarget } from "@/src/services/staffOrderService";
import type { MenuItem, Size } from "@/src/lib/types/menu";
import type { BundleCreatedRewardEffect, CartItem, ProjectedCartLine } from "@/src/lib/types/cart";
import type { StaffOrderResult } from "@/src/lib/types/order";
import {
  deriveBundleSelectionState,
  deriveBundleAllocationConstraints,
  buildBundleApplication,
  summarizeBundleCart,
  resolveBundleSelectionSiblings,
  type BundleSelectionAllocation,
} from "@/src/lib/utils/bundleVoucher";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { projectCart } from "@/src/lib/utils/cartProjection";
import { serializeCartOrderItems } from "@/src/lib/utils/cartOrderPayload";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import { normalizeStaffBundleApplications } from "@/src/lib/utils/staffBundlePayload";
import { getVoucherAvailabilityMessage } from "@/src/lib/utils/voucherModalHelpers";
import { useVoucherAcquisition } from "@/src/hooks/useVoucherAcquisition";
import { validateBundleCartDraft, type BundleCartDraftResult, type BundleCartDraftValidation } from "@/src/lib/utils/bundleCartDraft";
import {
  findUnavailableBundleTokens,
  getBundleCheckoutAvailabilityMessage,
  getBundleCheckoutAvailabilityReason,
} from "@/src/lib/utils/bundleCheckoutError";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import {
  usePendingCounterTransfers,
  useStaffCounterCheckoutPayment,
} from "@/src/lib/hooks/useCounterTransferPayment";

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildOrderItems = (cart: ProjectedCartLine[], includeClientLineId: boolean): CreateStaffOrderPayload["items"] =>
  serializeCartOrderItems(cart, { includeClientLineId });

function mergeScannedDiscountVoucher(vouchers: MyVoucher[], scanned: ReturnType<typeof useStaffCartStore.getState>["discountVoucher"]): MyVoucher[] {
  if (!scanned || vouchers.some((voucher) => voucher.qr_token === scanned.qr_token)) return vouchers;
  return [...vouchers, {
    qr_token: scanned.qr_token,
    voucher_type: "DISCOUNT",
    discount_type: scanned.discount_type,
    discount_value: scanned.discount_value,
    menu_item_id: null,
    size: null,
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: null,
    covered_delivery_fee_vnd: null,
    min_order_vnd: null,
    max_discount_vnd: null,
    status: "ACTIVE",
    used_channel: null,
    expires_at: null,
    redeemed_at: null,
    created_at: "",
    package: { name: "Voucher quét mã", description: null, points_cost: 0, bundleRule: null },
    menuItem: null,
    addonOption: null,
    staff: null,
    availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
  }];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = "loading" | "error" | "success";

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
  const [editingCartItem, setEditingCartItem] = useState<ProjectedCartLine | null>(null);
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
    size: Size | null;
    matcha_powder_id: string | null;
    milk_type_id: string | null;
  } | null>(null);
  const [scannedVoucherChoice, setScannedVoucherChoice] = useState<{
    qr_token: string;
    targets: ScannedVoucherMenuTarget[];
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  // ── Cart & Zustand ──────────────────────────────────────────────────────────────
  const cart = useStaffCartStore((s) => s.items);
  const customerInfo = useStaffCartStore((s) => s.customerInfo);
  const customerQrToken = useStaffCartStore((s) => s.customerQrToken);
  const setCustomerInfo = useStaffCartStore((s) => s.setCustomerInfo);
  const detachCustomer = useStaffCartStore((s) => s.detachCustomer);
  const discountVoucher = useStaffCartStore((s) => s.discountVoucher);
  const setDiscountVoucher = useStaffCartStore((s) => s.setDiscountVoucher);
  const selectedDiscountIds = useStaffCartStore((s) => s.selectedDiscountIds);
  const toggleDiscountId = useStaffCartStore((s) => s.toggleDiscountId);
  const addItem = useStaffCartStore((s) => s.addItem);
  const updateItem = useStaffCartStore((s) => s.updateItem);
  const removeItem = useStaffCartStore((s) => s.removeItem);
  const updateQuantity = useStaffCartStore((s) => s.updateQuantity);
  const clearCart = useStaffCartStore((s) => s.clearCart);
  const applyProductVoucher = useStaffCartStore((s) => s.applyProductVoucher);
  const removeProductVoucher = useStaffCartStore((s) => s.removeProductVoucher);
  const applyAddonVoucher = useStaffCartStore((s) => s.applyAddonVoucher);
  const removeAddonVoucher = useStaffCartStore((s) => s.removeAddonVoucher);
  const removeVoucherEffects = useStaffCartStore((s) => s.removeVoucherEffects);
  const bundleApplications = useStaffCartStore((s) => s.bundleApplications);
  const commitBundleCartDraft = useStaffCartStore((s) => s.commitBundleCartDraft);
  const commitBundleApplication = useStaffCartStore((s) => s.commitBundleApplication);
  const removeBundleApplication = useStaffCartStore((s) => s.removeBundleApplication);
  const reconcileBundleApplications = useStaffCartStore((s) => s.reconcileBundleApplications);
  const setBundleApplicationStatus = useStaffCartStore((s) => s.setBundleApplicationStatus);
  const markBundleApplicationsUnavailable = useStaffCartStore((s) => s.markBundleApplicationsUnavailable);
  const markBundleApplicationsVerifyFailed = useStaffCartStore((s) => s.markBundleApplicationsVerifyFailed);
  const bundleRuntime = useStaffCartStore((s) => s.bundleRuntime);
  const setProjectedTotalVnd = useStaffCartStore((s) => s.setProjectedTotalVnd);
  const persistenceWarning = useStaffCartStore((s) => s.persistenceWarning);

  // ── Voucher state (list-based) ────────────────────────────────────────

  const [bundleSetupVoucher, setBundleSetupVoucher] = useState<MyVoucher | null>(null);
  const [bundleSetupCustomerQrToken, setBundleSetupCustomerQrToken] = useState<string | null>(null);
  const [acquisitionCustomerQrToken, setAcquisitionCustomerQrToken] = useState<string | null>(null);
  const staffCustomerQrToken = customerQrToken;
  const resetCustomerVoucherState = useCallback(() => {
    setBundleSetupVoucher(null);
    setBundleSetupCustomerQrToken(null);
    setAcquisitionCustomerQrToken(null);
  }, []);
  const transitionCustomer = useCallback((info: Parameters<typeof setCustomerInfo>[0]) => {
    const previousQrToken = useStaffCartStore.getState().customerQrToken;
    const nextQrToken = info?.type === "existing" ? info.data.qr_token : null;
    if (previousQrToken && previousQrToken !== nextQrToken) {
      queryClient.removeQueries({ queryKey: ["staff", "cart-customer", previousQrToken] });
      queryClient.removeQueries({ queryKey: ["staff", "cart-customer-vouchers", previousQrToken] });
    }
    resetCustomerVoucherState();
    const result = setCustomerInfo(info);
    if (!result.ok) { toast.error(result.message); return; }
    if (info?.type === "existing") {
      queryClient.setQueryData(["staff", "cart-customer", info.data.qr_token], { type: "user", data: info.data });
    }
  }, [queryClient, resetCustomerVoucherState, setCustomerInfo]);

  // ── Category filter ───────────────────────────────────────────────────

  const [activeCategory, setActiveCategory] = useState("Tất cả");

  // ── Data fetching ─────────────────────────────────────────────────────

  // Sync fetched powders to Zustand
  useEffect(() => {
    if (pData) {
      setPowderData(pData);
    }
  }, [pData, setPowderData]);

  const selectedCustomerQuery = useQuery({
    queryKey: ["staff", "cart-customer", staffCustomerQrToken],
    queryFn: async () => {
      if (!staffCustomerQrToken) throw new Error("CUSTOMER_QR_MISSING");
      const result = await staffOrderService.scanQrToken(staffCustomerQrToken);
      if (result.type !== "user" || result.data.qr_token !== staffCustomerQrToken) throw new Error("CUSTOMER_QR_INVALID");
      return result;
    },
    enabled: Boolean(staffCustomerQrToken),
    retry: false,
  });
  const customerWalletQuery = useQuery({
    queryKey: ["staff", "cart-customer-vouchers", staffCustomerQrToken],
    queryFn: () => fetchCustomerVouchers(staffCustomerQrToken!),
    enabled: Boolean(staffCustomerQrToken && selectedCustomerQuery.data?.type === "user"),
    retry: false,
  });
  const customerVouchers = useMemo(() => customerWalletQuery.data ?? [], [customerWalletQuery.data]);

  useEffect(() => {
    if (selectedCustomerQuery.data?.type !== "user") return;
    const current = useStaffCartStore.getState().customerInfo;
    if (current?.type === "existing" && current.data.qr_token === selectedCustomerQuery.data.data.qr_token &&
      current.data.points_balance === selectedCustomerQuery.data.data.points_balance) return;
    setCustomerInfo({ type: "existing", data: selectedCustomerQuery.data.data });
  }, [selectedCustomerQuery.data, setCustomerInfo]);

  useEffect(() => {
    if (!staffCustomerQrToken || !selectedCustomerQuery.isError) return;
    detachCustomer();
    queryClient.removeQueries({ queryKey: ["staff", "cart-customer", staffCustomerQrToken] });
    queryClient.removeQueries({ queryKey: ["staff", "cart-customer-vouchers", staffCustomerQrToken] });
    toast.error("QR khách hàng không còn hợp lệ. Giỏ món trả phí vẫn được giữ.");
  }, [detachCustomer, queryClient, selectedCustomerQuery.isError, staffCustomerQrToken]);

  const { data: voucherPackages } = useQuery({
    queryKey: ["staff", "voucherPackages"],
    queryFn: listActiveVoucherPackages,
    enabled: userRole === "ADMIN",
    staleTime: 1000 * 60 * 5,
  });

  const availableVoucherPackages = useMemo(() => {
    if (userRole !== "ADMIN" || !voucherPackages) return [];
    return voucherPackages.filter((p) =>
      p.voucher_type === "DISCOUNT" ||
      (p.voucher_type === "BUNDLE" && p.acquisition_mode === "POINTS_EXCHANGE"),
    );
  }, [userRole, voucherPackages]);

  const refreshStaffWallet = useCallback(
    async (): Promise<MyVoucher[]> => {
      if (!staffCustomerQrToken) return [];
      const wallet = await fetchCustomerVouchers(staffCustomerQrToken);
      if (!Array.isArray(wallet)) throw new Error("Ví voucher khách hàng không hợp lệ");
      queryClient.setQueryData(["staff", "cart-customer-vouchers", staffCustomerQrToken], wallet);
      return wallet;
    },
    [queryClient, staffCustomerQrToken],
  );
  const cacheStaffWallet = useCallback((wallet: MyVoucher[]) => {
    if (!staffCustomerQrToken) return;
    queryClient.setQueryData(["staff", "cart-customer-vouchers", staffCustomerQrToken], wallet);
  }, [queryClient, staffCustomerQrToken]);
  const exchangeStaffVoucher = useCallback(async (packageId: string) => {
    if (!staffCustomerQrToken) throw new Error("Không có khách hàng để đổi voucher.");
    return {
      ...(await exchangeCustomerVoucher(staffCustomerQrToken, packageId)),
      already_granted: false,
    };
  }, [staffCustomerQrToken]);
  const refreshStaffCatalog = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "voucherPackages"] });
  }, [queryClient]);
  const {
    acquire,
    retryRefresh,
    receipt: acquisitionReceipt,
    isPending: isAcquiringVoucher,
  } = useVoucherAcquisition({
    refreshWallet: refreshStaffWallet,
    exchangeVoucher: exchangeStaffVoucher,
    refreshCatalog: refreshStaffCatalog,
  });

  const handleExchangeVoucher = async (packageId: string) => {
    if (customerInfo?.type !== "existing" || userRole !== "ADMIN") return;
    const pkg = availableVoucherPackages.find((candidate) => candidate.id === packageId);
    if (!pkg) return;
    const requestQrToken = customerInfo.data.qr_token;
    setAcquisitionCustomerQrToken(requestQrToken);
    try {
      const result = await acquire(pkg);
      const latestCustomer = useStaffCartStore.getState().customerInfo;
      if (latestCustomer?.type !== "existing" || latestCustomer.data.qr_token !== requestQrToken) return;
      toast.success("Đổi ưu đãi thành công!");

      if (result.wallet) {
        cacheStaffWallet(result.wallet);
        const acquiredBundle = pkg.voucher_type === "BUNDLE"
          ? result.wallet.find((voucher) => voucher.qr_token === result.acquired.qr_token)
          : undefined;
        if (acquiredBundle?.package.bundleRule) {
          setBundleSetupCustomerQrToken(requestQrToken);
          setBundleSetupVoucher(acquiredBundle);
        }
      }
      if (pkg.points_cost > 0 && latestCustomer?.type === "existing" && latestCustomer.data.qr_token === requestQrToken) {
        setCustomerInfo({
          type: "existing",
          data: {
            ...latestCustomer.data,
            points_balance: latestCustomer.data.points_balance - pkg.points_cost,
          },
        });
      }
    } catch (err: unknown) {
      const apiMessage = axios.isAxiosError<{ error?: string }>(err)
        ? err.response?.data?.error
        : null;
      toast.error(apiMessage || "Không thể đổi ưu đãi.");
    }
  };

  const handleRetryVoucherRefresh = async () => {
    try {
      const result = await retryRefresh();
      if (!result?.wallet) return;
      cacheStaffWallet(result.wallet);
      const acquiredBundle = result.wallet.find(
        (voucher) => voucher.qr_token === result.acquired.qr_token && voucher.package.bundleRule,
      );
      if (acquiredBundle && staffCustomerQrToken) {
        setBundleSetupCustomerQrToken(staffCustomerQrToken);
        setBundleSetupVoucher(acquiredBundle);
      }
    } catch {
      toast.error("Chưa làm mới được ví voucher. Vui lòng thử lại.");
    }
  };

  const scopedAcquisitionReceipt = acquisitionReceipt && staffCustomerQrToken !== null && acquisitionCustomerQrToken === staffCustomerQrToken
    ? acquisitionReceipt
    : null;

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

  const projectionVouchers = useMemo(
    () => mergeScannedDiscountVoucher(customerVouchers, discountVoucher),
    [customerVouchers, discountVoucher],
  );
  const walletRevalidating = Boolean(staffCustomerQrToken) &&
    (!selectedCustomerQuery.isSuccess || selectedCustomerQuery.isFetching ||
      !customerWalletQuery.isSuccess || customerWalletQuery.isFetching);
  const cartProjection = useMemo(() => projectCart({
    items: cart,
    menuData,
    powderData: pData,
    vouchers: walletRevalidating ? null : projectionVouchers,
    selectedOrderVoucherTokens: selectedDiscountIds,
    bundleApplications,
    shippingFeeVnd: 0,
  }), [bundleApplications, cart, menuData, pData, projectionVouchers, selectedDiscountIds, walletRevalidating]);
  const projectedCart = cartProjection.lines;
  const subtotal = useStaffCartTotalPrice();
  useEffect(() => {
    setProjectedTotalVnd(cartProjection.totals.grand_total_vnd);
  }, [cartProjection.totals.grand_total_vnd, setProjectedTotalVnd]);
  useEffect(() => {
    if (walletRevalidating || customerWalletQuery.isError) return;
    const validTokens = new Set(projectionVouchers
      .filter((voucher) => voucher.status === "ACTIVE" && voucher.availability.can_apply)
      .map((voucher) => voucher.qr_token));
    const attachedTokens = new Set([
      ...selectedDiscountIds,
      ...cart.flatMap((item) => [
        ...(item.lineVoucher ? [item.lineVoucher.token] : []),
        ...item.addonVouchers.map((voucher) => voucher.token),
      ]),
      ...bundleApplications.map((application) => application.voucher_qr_token),
    ]);
    for (const token of attachedTokens) if (!validTokens.has(token)) removeVoucherEffects(token);
  }, [bundleApplications, cart, customerWalletQuery.isError, projectionVouchers, removeVoucherEffects, selectedDiscountIds, walletRevalidating]);
  const bundleCartSummary = useMemo(() => summarizeBundleCart(projectedCart), [projectedCart]);
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
    const result = new Map(Object.entries(cartProjection.bundleErrorsByToken));
    for (const [token, message] of bundleConstraints.error_by_token) result.set(token, message);
    return result;
  }, [bundleConstraints.error_by_token, cartProjection.bundleErrorsByToken]);

  useEffect(() => {
    if (staffCustomerQrToken && customerInfo?.type !== "existing") return;
    reconcileBundleApplications(staffBundleOwnerKey);
  }, [cart, customerInfo?.type, reconcileBundleApplications, staffBundleOwnerKey, staffCustomerQrToken]);

  useEffect(() => {
    for (const bundle of bundleSelectionStates) {
      const token = bundle.application.voucher_qr_token;
      const projectedError = bundleErrorByToken.get(bundle.application.voucher_qr_token);
      const availabilityMessage = bundle.voucher
        ? getVoucherAvailabilityMessage(bundle.voucher)
        : null;
      const status = walletRevalidating
        ? customerWalletQuery.isError ? "VERIFY_FAILED" as const : "REVALIDATING" as const
        : bundle.voucher && !bundle.voucher.availability.can_apply
        ? "UNAVAILABLE" as const
        : projectedError
        ? "CONFLICT" as const
        : bundle.state.status === "READY"
          ? "READY" as const
          : bundle.state.status === "INELIGIBLE" || bundle.state.status === "CONFLICT" || bundle.state.status === "STALE"
            ? "CONFLICT" as const
            : "NEEDS_CONFIGURATION" as const;
      const message = customerWalletQuery.isError
        ? "Không thể xác minh lại ví voucher của khách hàng"
        : availabilityMessage ?? projectedError ?? bundle.state.message;
      const current = bundleRuntime[token];
      if (current?.status !== status || current?.message !== message) {
        setBundleApplicationStatus(token, status, message);
      }
    }
  }, [bundleErrorByToken, bundleRuntime, bundleSelectionStates, customerWalletQuery.isError, setBundleApplicationStatus, walletRevalidating]);

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
    const result = commitBundleApplication({
      voucher_qr_token: voucher.qr_token,
      owner_key: staffBundleOwnerKey,
      qualifier_allocations: payload?.qualifier_allocations ?? [],
      reward_allocations: rewardAllocations,
      created_reward_effects: retainBundleRewardEffects(previous?.created_reward_effects ?? [], rewardAllocations, effect),
    });
    if (!result.ok) { toast.error(result.message); return; }
    setBundleApplicationStatus(voucher.qr_token, status, selection.message);
  }, [bundleApplications, bundleCartSummary, commitBundleApplication, setBundleApplicationStatus, staffBundleOwnerKey]);

  const scopedBundleSetupVoucher = bundleSetupVoucher && staffCustomerQrToken !== null && bundleSetupCustomerQrToken === staffCustomerQrToken
    ? bundleSetupVoucher
    : null;
  const bundleSetupApplication = scopedBundleSetupVoucher
    ? bundleApplications.find((application) => application.voucher_qr_token === scopedBundleSetupVoucher.qr_token)
    : undefined;
  const openBundleSetup = useCallback((voucher: MyVoucher) => {
    if (staffCustomerQrToken) setBundleSetupCustomerQrToken(staffCustomerQrToken);
    setBundleSetupVoucher(voucher);
  }, [staffCustomerQrToken]);
  const validateStaffBundleDraft = useCallback((candidate: BundleCartDraftResult): BundleCartDraftValidation => {
    if (!scopedBundleSetupVoucher || !staffBundleOwnerKey) {
      return { ok: false, error: "Vui lòng chọn khách hàng trước khi dùng voucher BUNDLE" };
    }
    const summary = getBundleVoucherSummary(scopedBundleSetupVoucher);
    if (!summary) return { ok: false, error: "Voucher BUNDLE không còn khả dụng" };
    const siblingResolution = resolveBundleSelectionSiblings({
      current_qr_token: scopedBundleSetupVoucher.qr_token,
      applications: bundleApplications,
      summaries: customerVouchers.flatMap((voucher) => {
        const resolved = getBundleVoucherSummary(voucher);
        return resolved ? [resolved] : [];
      }),
    });
    if (!siblingResolution.ok) return siblingResolution;
    return validateBundleCartDraft({ voucher: summary, candidate, ownerKey: staffBundleOwnerKey, siblingApplications: siblingResolution.siblings });
  }, [bundleApplications, customerVouchers, scopedBundleSetupVoucher, staffBundleOwnerKey]);


  // ── Cart handlers ─────────────────────────────────────────────────────

  const handleAddToCart = (item: CartItem) => {
    const { cartId, ...line } = item;
    void cartId;
    const result = editingCartItem
      ? updateItem(editingCartItem.cartId, line)
      : addItem(line);
    if (!result.ok) return result;
    setSelectedItem(null);
    setEditingCartItem(null);
    setEditingAllowedSizes(undefined);
    setScannedProductVoucher(null);
    return result;
  };

  const handleEditItem = (item: ProjectedCartLine, allowedSizes?: Size[]) => {
    const menuItem = menuItems.find((m) => m.id === item.menuItemId);
    if (!menuItem) return;
    const voucherSizes = item.lineVoucher?.kind === "PRODUCT_DISCOUNT" && item.configuration.size !== null
      ? customerVouchers.find((voucher) => voucher.qr_token === item.lineVoucher?.token)?.eligible_sizes
      : undefined;
    setEditingCartItem(item);
    setEditingAllowedSizes(allowedSizes ?? (voucherSizes?.length ? voucherSizes : item.lineVoucher?.kind === "PRODUCT_DISCOUNT" && item.configuration.size !== null ? [item.configuration.size] : undefined));
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
      const result = updateQuantity(cartId, newQty);
      if (!result.ok) toast.error(result.message);
    }
  };

  const resetCheckout = useCallback(() => {
    const previousQrToken = useStaffCartStore.getState().customerQrToken;
    clearCart();
    detachCustomer();
    if (previousQrToken) {
      queryClient.removeQueries({ queryKey: ["staff", "cart-customer", previousQrToken] });
      queryClient.removeQueries({ queryKey: ["staff", "cart-customer-vouchers", previousQrToken] });
    }
    setInitialSearchQuery("");
    setCartOpen(false);
  }, [clearCart, detachCustomer, queryClient]);

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
    if (cartProjection.revalidating || walletRevalidating) {
      toast.info("Đang xác minh lại menu và ví voucher của khách hàng.");
      return;
    }
    if (cartProjection.errors.length > 0) {
      toast.error(cartProjection.errors[0]);
      return;
    }
    const bundleProjectionError = [...bundleErrorByToken.values()][0];
    if (bundleProjectionError) {
      toast.error(bundleProjectionError);
      return;
    }
    const persistedBlockedBundle = bundleApplications.find((application) => bundleRuntime[application.voucher_qr_token]?.status !== "READY");
    if (persistedBlockedBundle) {
      toast.error(
        bundleRuntime[persistedBlockedBundle.voucher_qr_token]?.message ?? "Voucher BUNDLE cần được kiểm tra lại trước khi tạo đơn.",
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
          c.lineVoucher || c.addonVouchers.length > 0,
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
          cacheStaffWallet(refreshedVouchers);
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
    if (cartProjection.checkoutBlocked) {
      toast.error(cartProjection.revalidating ? "Giỏ hàng đang được xác minh lại." : cartProjection.errors[0] ?? "Giỏ hàng chưa sẵn sàng để tạo đơn.");
      return;
    }
    const blocked = bundleApplications.find((application) => bundleRuntime[application.voucher_qr_token]?.status !== "READY");
    if (blocked) {
      toast.error(bundleRuntime[blocked.voucher_qr_token]?.message ?? "Voucher BUNDLE cần được kiểm tra lại trước khi tạo đơn.");
      return;
    }
    isSubmittingRef.current = true;

    setConfirmCheckoutOpen(false);
    setQrVerifyOpen(false);
    setIsSubmitting(true);

    let payload: CreateStaffOrderPayload;
    const readyBundleTokens = new Set(bundleApplications
      .filter((application) => bundleRuntime[application.voucher_qr_token]?.status === "READY")
      .map((application) => application.voucher_qr_token));
    const normalizedBundleApplications = normalizeStaffBundleApplications(bundleApplications, readyBundleTokens);
    const items = buildOrderItems(projectedCart, normalizedBundleApplications.length > 0);
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
        ...(normalizedBundleApplications.length > 0
          ? { bundle_applications: normalizedBundleApplications }
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
    points_balance,
  }: {
    phone_number: string;
    name?: string;
    points_balance?: number;
    qr_token?: string;
  }) => {
    setScanOpen(false);
    if (name) {
      if (!qr_token) {
        setInitialSearchQuery(phone_number);
        setCustomerSelectOpen(true);
        return;
      }
      transitionCustomer({
        type: "existing",
        data: {
          qr_token,
          phone_number,
          name,
          points_balance: points_balance ?? 0,
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

  const applyScannedVoucherTarget = (qrToken: string, target: ScannedVoucherMenuTarget) => {
    const item = menuItems.find((candidate) => candidate.id === target.menu_item_id);
    if (!item) return;
    setScannedProductVoucher({
      qr_token: qrToken,
      covered_price_vnd: target.covered_price_vnd ?? 0,
      size: target.size,
      matcha_powder_id: target.matcha_powder_id,
      milk_type_id: target.milk_type_id,
    });
    setSelectedItem(item);
    setScannedVoucherChoice(null);
    setScanOpen(false);
  };

  const handleScanVoucherProduct = (data: {
    qr_token: string;
    menu_item_id: string | null;
    size: Size | null;
    matcha_powder_id: string | null;
    milk_type_id: string | null;
    covered_price_vnd: number;
    has_normalized_targets: boolean;
    eligible_menu_items: ScannedVoucherMenuTarget[];
  }) => {
    if (data.eligible_menu_items.length > 1) {
      setScannedVoucherChoice({ qr_token: data.qr_token, targets: data.eligible_menu_items });
      setScanOpen(false);
      return;
    }
    const target = data.eligible_menu_items[0] ?? (!data.has_normalized_targets && data.menu_item_id ? {
      menu_item_id: data.menu_item_id,
      name: "Món được tặng",
      category: "",
      is_available: true,
      is_seasonal: false,
      size: data.size,
      matcha_powder_id: data.matcha_powder_id,
      milk_type_id: data.milk_type_id,
      covered_price_vnd: data.covered_price_vnd,
    } : null);
    if (target) applyScannedVoucherTarget(data.qr_token, target);
  };

  // ── Voucher wrappers ──────────────────────────────────────────────────

  const handleApplyProduct = (
    cartId: string,
    voucher: import("@/src/services/staffVoucherService").MyVoucher,
  ): CartMutationResult => {
    if (voucher.voucher_type === "ITEM" || voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "PRODUCT_DISCOUNT") {
      return applyProductVoucher(
        cartId,
        voucher.qr_token,
        undefined,
        voucher.voucher_type,
      );
    }
    return { ok: false, code: "VOUCHER_CONFLICT", message: "Voucher không áp dụng được cho món này." };
  };

  const handleApplyAddon = (
    cartId: string,
    voucher: import("@/src/services/staffVoucherService").MyVoucher,
    addonOptionId: string,
  ): CartMutationResult => {
    const line = projectedCart.find((item) => item.cartId === cartId);
    const addon = line?.resolvedAddons.find((candidate) => candidate.id === addonOptionId);
    const group = menuData?.addon_groups.find((candidate) => candidate.id === addon?.groupId);
    if (!line || !addon || !group) {
      return { ok: false, code: "ADDON_NOT_SELECTED", message: "Topping không còn hợp lệ." };
    }
    return applyAddonVoucher(cartId, voucher.qr_token, addonOptionId, {
      groupOptionIds: group.options.map((option) => option.id),
      maxSelect: group.max_select,
      isExtraMatcha: addon.isExtraMatcha,
    });
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
        cart={projectedCart}
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
        onClearCustomer={() => transitionCustomer(null)}
        bundleApplications={bundleApplications}
        onBundleApplicationChange={updateBundleApplication}
        onRequestRemoveBundle={removeBundleApplication}
        onOpenBundleSetup={openBundleSetup}
        onRepairBundle={openBundleSetup}
        bundleSetupVoucher={scopedBundleSetupVoucher}
        bundleSetupApplication={bundleSetupApplication}
        onCloseBundleSetup={() => {
          setBundleSetupVoucher(null);
          setBundleSetupCustomerQrToken(null);
        }}
        onValidateBundleDraft={validateStaffBundleDraft}
        onCommitBundleDraft={commitBundleCartDraft}
        onBundleSetupSuccess={() => {
          setBundleSetupVoucher(null);
          setBundleSetupCustomerQrToken(null);
        }}
        customerVouchers={customerVouchers}
        selectedDiscountIds={selectedDiscountIds}
        onToggleDiscount={toggleDiscountId}
        availableVoucherPackages={availableVoucherPackages}
        onExchangeVoucher={handleExchangeVoucher}
        isExchanging={isAcquiringVoucher}
        acquisitionReceipt={scopedAcquisitionReceipt}
        onRetryVoucherRefresh={() => { void handleRetryVoucherRefresh(); }}
        checkoutBlocked={cartProjection.checkoutBlocked || walletRevalidating}
        voucherRevalidating={cartProjection.revalidating}
        persistenceWarning={persistenceWarning}
        preventCloseOutside={
          customerSelectOpen ||
          confirmCheckoutOpen ||
          qrVerifyOpen ||
          !!itemToRemove ||
          clearCartConfirmOpen ||
          !!scopedBundleSetupVoucher
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
              initialSize={scannedProductVoucher?.size}
              initialPowderId={scannedProductVoucher?.matcha_powder_id}
              initialBaseLiquidId={scannedProductVoucher?.milk_type_id}
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
              currentCartItems={projectedCart}
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
          initialSize={scannedProductVoucher?.size}
          initialPowderId={scannedProductVoucher?.matcha_powder_id}
          initialBaseLiquidId={scannedProductVoucher?.milk_type_id}
          availableVouchers={customerVouchers}
          onClose={() => {
            setSelectedItem(null);
            setScannedProductVoucher(null);
          }}
          onConfirm={handleAddToCart}
          nested={false}
          currentCartItems={projectedCart}
        />
      )}

      {/* CustomerSelectModal */}
      {customerSelectOpen && (
        <CustomerSelectModal
          initialQuery={initialSearchQuery}
          onClose={() => setCustomerSelectOpen(false)}
          onSelect={(info) => {
            transitionCustomer(info);
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
            const result = removeItem(itemToRemove);
            if (!result.ok) {
              toast.error(result.message);
              return;
            }
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
          const result = clearCart();
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
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
      <ResponsiveOverlay
        open={scannedVoucherChoice !== null}
        onOpenChange={(open) => { if (!open) setScannedVoucherChoice(null); }}
        layer="critical"
        title="Chọn món được tặng"
      >
        <div className="space-y-2 p-4">
          {scannedVoucherChoice?.targets.map((target) => (
            <button
              key={target.menu_item_id}
              type="button"
              onClick={() => applyScannedVoucherTarget(scannedVoucherChoice.qr_token, target)}
              className="min-h-14 w-full rounded-xl border bg-card px-4 text-left"
            >
              <span className="block font-semibold">{target.name}</span>
              <span className="text-xs text-muted-foreground">{target.size ? <>Size <SizeLabel size={target.size} /></> : "Món lẻ"}</span>
            </button>
          ))}
        </div>
      </ResponsiveOverlay>
    </>
  );
}
