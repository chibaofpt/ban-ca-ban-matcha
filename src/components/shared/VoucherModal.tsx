"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { AnimatePresence } from "framer-motion";
import { Loader2, LogIn, Ticket } from "lucide-react";
import { toast } from "sonner";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useCurrentUser, useIsLoggedIn } from "@/src/lib/store/authStore";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherAcquisition } from "@/src/hooks/useVoucherAcquisition";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import {
  filterHistoryVouchers,
  filterModalVouchers,
  getExchangeErrorMessage,
  type VoucherModalTab,
} from "@/src/lib/utils/voucherModalHelpers";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";
import { listMyVouchers, refundVoucher } from "@/src/services/customerVoucherService";
import { QrModal } from "./QrModal";
import { VoucherAcquisitionConfirm } from "./VoucherAcquisitionConfirm";
import { VoucherCard } from "./VoucherCards";
import { VoucherHistorySection, VoucherModalFrame } from "./VoucherModalSections";
import { VoucherPackageCatalog } from "./VoucherPackageCatalog";
import { VoucherDetailSheet } from "./VoucherDetailSheet";
import { BundleVoucherSetupSheet } from "./BundleVoucherSetupSheet";
import { buildVoucherActionModel, resolveWalletUseNowIntent, selectOrderVoucherToken } from "@/src/utils/customerVoucherSelection";
import { useAddVoucherToCart } from "@/src/hooks/useAddVoucherToCart";
import { canApplyDiscount } from "@/src/lib/utils/voucherUseNowHelpers";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { fetchMenu } from "@/src/services/menuService";
import { useCartTotalPrice } from "@/src/lib/store/cartStore";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import type { MenuData } from "@/src/lib/types/menu";
import type { BundleCartDraftResult, BundleCartDraftValidation } from "@/src/lib/utils/bundleCartDraft";
import { validateBundleCartDraft } from "@/src/lib/utils/bundleCartDraft";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { resolveBundleSelectionSiblings } from "@/src/lib/utils/bundleVoucher";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { getVoucherRefundConfirmation } from "@/src/lib/utils/voucherModalHelpers";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";

/** Unified customer wallet and voucher acquisition modal. */
export default function VoucherModal() {
  const queryClient = useQueryClient();
  const { open, close } = useVoucherModalStore();
  const isLoggedIn = useIsLoggedIn();
  const currentUser = useCurrentUser();
  const pendingIntent = useAuthModalStore((state) => state.pendingIntent);
  const clearIntent = useAuthModalStore((state) => state.clearIntent);
  const setCartOpen = useCartStore((state) => state.setCartOpen);
  const commitBundleCartDraft = useCartStore((state) => state.commitBundleCartDraft);
  const removeVoucherEffects = useCartStore((state) => state.removeVoucherEffects);
  const { data: points = 0 } = useCustomerPoints();
  const { data: vouchers = [], isLoading: vouchersLoading } = useCustomerVouchers({ enabled: open && isLoggedIn });
  const { data: packages = [], isLoading: packagesLoading } = useVoucherPackages({ enabled: open });
  const refreshWallet = useCallback(() => queryClient.fetchQuery({
    queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS,
    queryFn: listMyVouchers,
  }), [queryClient]);
  const { acquire, retryRefresh, receipt, isPending } = useVoucherAcquisition({ refreshWallet });
  const [activeTab, setActiveTab] = useState<VoucherModalTab>("my_vouchers");
  const [pendingPackage, setPendingPackage] = useState<VoucherPackage | null>(null);
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [highlightToken, setHighlightToken] = useState<string | null>(null);
  const [qrVoucher, setQrVoucher] = useState<MyVoucher | null>(null);
  const [detailPackageId, setDetailPackageId] = useState<string | null>(null);
  const [detailVoucher, setDetailVoucher] = useState<MyVoucher | null>(null);
  const [bundleSetupVoucher, setBundleSetupVoucher] = useState<MyVoucher | null>(null);
  const [refundCandidate, setRefundCandidate] = useState<MyVoucher | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isRetryingWallet, setIsRetryingWallet] = useState(false);
  const [menuData, setMenuData] = useState<MenuData | undefined>();
  const cartItems = useCartStore((s) => s.items);
  const bundleApplications = useCartStore((s) => s.bundleApplications);
  const subtotalVnd = useCartTotalPrice();
  const selectedVoucherIds = useCartStore((s) => s.selectedVoucherIds);
  const setSelectedVoucherIds = useCartStore((s) => s.setSelectedVoucherIds);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGram = usePowderStore((s) => s.defaultPowderGram);
  const { addToCart, loading: isUsingVoucher } = useAddVoucherToCart();
  const consumedIntentRef = useRef<object | null>(null);
  const resolvedDetailPackageRef = useRef<string | null>(null);
  const detailPackage = detailPackageId
    ? packages.find((pkg) => pkg.id === detailPackageId) ?? null
    : null;

  const openAcquiredBundle = useCallback((wallet: MyVoucher[] | null, token: string) => {
    const voucher = wallet?.find((candidate) => candidate.qr_token === token);
    if (voucher?.voucher_type === "BUNDLE") setBundleSetupVoucher(voucher);
  }, []);

  const activeVouchers = filterModalVouchers(vouchers);
  const selectedDiscountVouchers = activeVouchers.filter(v => selectedVoucherIds.includes(v.qr_token) && v.voucher_type === "DISCOUNT");
  const totalAfterDiscountVnd = Math.max(0, subtotalVnd - estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalVnd));

  useEffect(() => {
    if (detailVoucher || bundleSetupVoucher) {
      if (!menuData) {
        fetchMenu().then(setMenuData).catch(console.error);
      }
    }
  }, [detailVoucher, bundleSetupVoucher, menuData]);

  const handleUseNowSuccess = useCallback(() => {
    setDetailVoucher(null);
    close();
    setCartOpen(true);
  }, [close, setCartOpen]);

  const handleWalletUseNow = useCallback(async (voucher: MyVoucher) => {
    // Pre-fetch menu for voucher types that need it in VoucherDetailSheet
    if (voucher.voucher_type === "PRODUCT_DISCOUNT" || voucher.voucher_type === "BUNDLE") {
      const resolvedMenu = menuData ?? await fetchMenu();
      if (!menuData) setMenuData(resolvedMenu);
    }
    const intent = resolveWalletUseNowIntent({
      voucherType: voucher.voucher_type,
      canApplyOrder: (voucher.voucher_type === "DISCOUNT" || voucher.voucher_type === "FREESHIP") &&
        canApplyDiscount(voucher, subtotalVnd).canApply,
    });
    if (intent.kind === "open-detail") return void setDetailVoucher(voucher);
    if (intent.kind === "open-bundle") return void setBundleSetupVoucher(voucher);
    if (intent.kind === "apply-order") {
      setSelectedVoucherIds((current) => selectOrderVoucherToken(current, voucher, activeVouchers));
      handleUseNowSuccess();
      return;
    }
    const result = await addToCart(voucher);
    if (result.ok) handleUseNowSuccess();
    else setDetailVoucher(voucher);
  }, [activeVouchers, addToCart, handleUseNowSuccess, menuData, setSelectedVoucherIds, subtotalVnd]);

  const handleBundleSuccess = useCallback(() => {
    setBundleSetupVoucher(null);
    setDetailVoucher(null);
    close();
    setCartOpen(true);
  }, [close, setCartOpen]);

  const handleRefund = useCallback(async () => {
    if (!refundCandidate || isRefunding) return;
    setIsRefunding(true);
    try {
      const refunded = await refundVoucher(refundCandidate.qr_token);
      removeVoucherEffects(refundCandidate.qr_token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS }),
        queryClient.invalidateQueries({ queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_POINTS }),
      ]);
      toast.success(`Đã hoàn ${refunded.points_refunded.toLocaleString("vi-VN")} điểm`);
      setRefundCandidate(null);
      setDetailVoucher(null);
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error
        : null;
      toast.error(message ?? "Không thể hoàn điểm lúc này. Voucher và giỏ hàng vẫn được giữ nguyên.");
    } finally {
      setIsRefunding(false);
    }
  }, [isRefunding, queryClient, refundCandidate, removeVoucherEffects]);

  useEffect(() => {
    if (open) setActiveTab(isLoggedIn ? "my_vouchers" : "packages");
    else if (!isRefunding) setRefundCandidate(null);
  }, [isLoggedIn, isRefunding, open]);

  const acquirePackage = useCallback(async (pkg: VoucherPackage) => {
    setExchangingId(pkg.id);
    try {
      const result = await acquire(pkg);
      setHighlightToken(result.acquired.qr_token);
      setActiveTab("my_vouchers");
      setDetailPackageId(null);
      openAcquiredBundle(result.wallet, result.acquired.qr_token);
      if (result.refreshError) {
        toast.warning("Đã nhận voucher. Hãy làm mới ví để xem chi tiết.");
      }
      toast.success(pkg.acquisition_mode === "FREE_CLAIM" ? `Đã nhận: ${pkg.name}` : `Đổi thành công: ${pkg.name}`);
    } catch (error: unknown) {
      const code = axios.isAxiosError<{ code?: string }>(error)
        ? error.response?.data?.code ?? "UNKNOWN"
        : "UNKNOWN";
      toast.error(getExchangeErrorMessage(code, pkg.points_cost, points));
    } finally {
      setExchangingId(null);
      setPendingPackage(null);
    }
  }, [acquire, openAcquiredBundle, points]);

  const handleRetryWalletRefresh = useCallback(async () => {
    if (!receipt || isRetryingWallet) return;
    setIsRetryingWallet(true);
    try {
      const result = await retryRefresh();
      if (result) {
        setActiveTab("my_vouchers");
        openAcquiredBundle(result.wallet, result.acquired.qr_token);
        toast.success("Đã cập nhật ví voucher.");
      }
    } catch {
      toast.error("Chưa thể cập nhật ví. Bạn có thể thử lại.");
    } finally {
      setIsRetryingWallet(false);
    }
  }, [isRetryingWallet, openAcquiredBundle, receipt, retryRefresh]);

  const handleAcquire = useCallback((pkg: VoucherPackage) => {
    if (!isLoggedIn) {
      useAuthModalStore.getState().openLoginWithIntent({ type: "voucher_acquire", packageId: pkg.id });
      return;
    }
    if (pkg.acquisition_mode === "POINTS_EXCHANGE") setPendingPackage(pkg);
    else void acquirePackage(pkg);
  }, [acquirePackage, isLoggedIn]);

  useEffect(() => {
    if (!open || !isLoggedIn || pendingIntent?.type !== "voucher_acquire" || packagesLoading) return;
    if (consumedIntentRef.current === pendingIntent) return;
    consumedIntentRef.current = pendingIntent;
    const pkg = packages.find((item) => item.id === pendingIntent.packageId);
    clearIntent();
    setActiveTab("packages");
    if (!pkg) return void toast.error("Gói ưu đãi không còn khả dụng.");
    if (pkg.acquisition_mode === "POINTS_EXCHANGE") setPendingPackage(pkg);
    else void acquirePackage(pkg);
  }, [acquirePackage, clearIntent, isLoggedIn, open, packages, packagesLoading, pendingIntent]);

  useEffect(() => {
    if (!pendingIntent) consumedIntentRef.current = null;
  }, [pendingIntent]);

  useEffect(() => {
    if (detailPackage) resolvedDetailPackageRef.current = detailPackage.id;
  }, [detailPackage]);

  useEffect(() => {
    if (!detailPackageId || packagesLoading || detailPackage) return;
    if (resolvedDetailPackageRef.current !== detailPackageId) return;
    resolvedDetailPackageRef.current = null;
    setDetailPackageId(null);
    toast.error("Gói ưu đãi không còn khả dụng.");
  }, [detailPackage, detailPackageId, packagesLoading]);


  const acquisitionReceiptView = receipt ? (
    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3" role="status" aria-live="polite">
      <p className="text-sm font-bold text-emerald-900">Đã nhận voucher</p>
      <p className="mt-1 break-all text-xs text-emerald-800">Mã: {receipt.acquired.qr_token}</p>
      {receipt.refreshError ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-xs text-amber-800">Ví chưa cập nhật, voucher vẫn đã được ghi nhận.</p>
          <button
            type="button"
            onClick={() => void handleRetryWalletRefresh()}
            disabled={isRetryingWallet}
            className="min-h-11 shrink-0 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 disabled:opacity-60"
          >
            {isRetryingWallet ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
            Làm mới ví
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const loading = packagesLoading || (isLoggedIn && vouchersLoading);
  const content = (
    <VoucherModalFrame
      activeTab={activeTab}
      isLoggedIn={isLoggedIn}
      voucherCount={activeVouchers.length}
      pointsBalance={points}
      onChange={setActiveTab}
      onClose={close}
      detailOpen={detailVoucher !== null || detailPackage !== null}
      overlayContent={(
        <>
          <AnimatePresence>{qrVoucher && <QrModal voucher={qrVoucher} onClose={() => setQrVoucher(null)} />}</AnimatePresence>
          <VoucherAcquisitionConfirm pkg={pendingPackage} pointsBalance={points} isLoading={isPending} onCancel={() => setPendingPackage(null)} onConfirm={() => { if (pendingPackage) void acquirePackage(pendingPackage); }} />

          <AnimatePresence>
            {detailPackage && (
              <VoucherDetailSheet
                key="package-detail-sheet"
                packageData={detailPackage}
                pointsBalance={points}
                isLoggedIn={isLoggedIn}
                isExchanging={isPending && exchangingId === detailPackage.id}
                onBack={() => setDetailPackageId(null)}
                onExchange={handleAcquire}
                onLogin={handleAcquire}
              />
            )}
            {detailVoucher && (
              <VoucherDetailSheet
                key="voucher-detail-sheet"
                voucher={detailVoucher}
                cartItems={cartItems}
                subtotalVnd={subtotalVnd}
                totalAfterDiscountVnd={totalAfterDiscountVnd}
                myVouchers={activeVouchers}
                orderType="PICKUP"
                shippingFee={null}
                menuData={menuData}
                onBack={() => setDetailVoucher(null)}
                onUseNowSuccess={handleUseNowSuccess}
                onOpenBundleSetup={(v) => { setDetailVoucher(null); setBundleSetupVoucher(v); }}
                onRequestRefund={setRefundCandidate}
                isRefunding={isRefunding}
              />
            )}
          </AnimatePresence>

          {bundleSetupVoucher && menuData && (
            <BundleVoucherSetupSheet
              open={!!bundleSetupVoucher}
              voucher={bundleSetupVoucher}
              cartItems={cartItems}
              initialApplication={bundleApplications.find((application) => application.voucher_qr_token === bundleSetupVoucher.qr_token)}
              menuData={menuData}
              milkTypes={menuData.milk_types}
              powders={powders}
              defaultPowderGram={defaultPowderGram}
              onClose={() => setBundleSetupVoucher(null)}
              onValidateDraft={(candidate: BundleCartDraftResult): BundleCartDraftValidation => {
                const summary = getBundleVoucherSummary(bundleSetupVoucher);
                if (!summary) return { ok: false, error: "Voucher BUNDLE không còn khả dụng" };
                const siblingResolution = resolveBundleSelectionSiblings({
                  current_qr_token: bundleSetupVoucher.qr_token,
                  applications: bundleApplications,
                  summaries: activeVouchers.flatMap((voucher) => {
                    const resolved = getBundleVoucherSummary(voucher);
                    return resolved ? [resolved] : [];
                  }),
                });
                if (!siblingResolution.ok) return siblingResolution;
                return validateBundleCartDraft({
                  voucher: summary,
                  candidate,
                  ownerKey: `customer:${currentUser?.phone ?? "anonymous"}`,
                  siblingApplications: siblingResolution.siblings,
                });
              }}
              onCommitDraft={commitBundleCartDraft}
              onSuccess={handleBundleSuccess}
            />
          )}
          <ConfirmModal
            isOpen={refundCandidate !== null}
            title="Hoàn điểm voucher"
            message={getVoucherRefundConfirmation(refundCandidate?.availability.refund_points ?? 0)}
            confirmLabel={`Hoàn ${refundCandidate?.availability.refund_points.toLocaleString("vi-VN") ?? 0} điểm`}
            isDestructive
            isLoading={isRefunding}
            onCancel={() => setRefundCandidate(null)}
            onConfirm={() => void handleRefund()}
          />
        </>
      )}
    >
        {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-primary" /></div> : activeTab === "my_vouchers" && isLoggedIn ? (
          activeVouchers.length === 0 ? <>{acquisitionReceiptView}<div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed py-16 text-center"><Ticket className="text-primary/30" /><p className="text-sm font-bold text-primary/60">Bạn chưa có voucher nào</p></div></> :
          <>{acquisitionReceiptView}<div className="grid gap-3 pb-8 sm:grid-cols-2">{activeVouchers.map((voucher) => (
            <VoucherCard
              key={voucher.qr_token}
              voucher={voucher}
              isSelected={highlightToken === voucher.qr_token}
              onClick={() => setDetailVoucher(voucher)}
              onAction={() => void handleWalletUseNow(voucher)}
              actionModel={buildVoucherActionModel({
                context: "wallet",
                busy: isUsingVoucher,
                selectable: voucher.status === "ACTIVE" && voucher.availability.can_apply,
                disabledReason: voucher.availability.can_apply ? null : "Voucher hiện chưa thể sử dụng",
              })}
            />
          ))}</div></>
        ) : activeTab === "history" && isLoggedIn ? (
          <VoucherHistorySection vouchers={filterHistoryVouchers(vouchers)} onVoucherClick={setDetailVoucher} />
        ) : (
          <div>
            {!isLoggedIn && <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3"><LogIn className="size-5 shrink-0 text-primary" /><p className="flex-1 text-sm font-bold text-primary">Đăng nhập để nhận hoặc đổi ưu đãi</p><button type="button" onClick={() => useAuthModalStore.getState().openLogin()} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring">Đăng nhập</button></div>}
            <VoucherPackageCatalog packages={packages} pointsBalance={points} pendingPackageId={isPending ? exchangingId : null} onAcquire={handleAcquire} onPackageClick={(pkg) => setDetailPackageId(pkg.id)} />
          </div>
        )}
    </VoucherModalFrame>
  );

  return (
    <ResponsiveOverlay
      open={open}
      title="Ưu đãi"
      presentation="bare"
      className="w-full md:max-w-2xl"
      onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}
    >
      {content}
    </ResponsiveOverlay>
  );
}
