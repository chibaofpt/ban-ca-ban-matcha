"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { AnimatePresence } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { Loader2, LogIn, Star, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useCurrentUser, useIsLoggedIn } from "@/src/lib/store/authStore";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherAcquisition } from "@/src/hooks/useVoucherAcquisition";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import {
  filterHistoryVouchers,
  filterModalVouchers,
  getAdjacentVoucherTab,
  getExchangeErrorMessage,
  type VoucherModalTab,
} from "@/src/lib/utils/voucherModalHelpers";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";
import { refundVoucher } from "@/src/services/customerVoucherService";
import { QrModal } from "./QrModal";
import { VoucherAcquisitionConfirm } from "./VoucherAcquisitionConfirm";
import { VoucherCard } from "./VoucherCards";
import { VoucherHistorySection, VoucherModalTabs } from "./VoucherModalSections";
import { VoucherPackageCatalog } from "./VoucherPackageCatalog";
import { VoucherDetailSheet } from "./VoucherDetailSheet";
import { BundleVoucherSetupSheet } from "./BundleVoucherSetupSheet";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { fetchMenu } from "@/src/services/menuService";
import { useCartTotalPrice } from "@/src/lib/store/cartStore";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import type { MenuData } from "@/src/lib/types/menu";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { buildBundleApplication, summarizeBundleCart } from "@/src/lib/utils/bundleVoucher";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { getVoucherRefundConfirmation } from "@/src/lib/utils/voucherModalHelpers";
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";

/** Unified customer wallet and voucher acquisition modal. */
export default function VoucherModal() {
  const queryClient = useQueryClient();
  const { open, openModal, close } = useVoucherModalStore();
  const isLoggedIn = useIsLoggedIn();
  const currentUser = useCurrentUser();
  const pendingIntent = useAuthModalStore((state) => state.pendingIntent);
  const clearIntent = useAuthModalStore((state) => state.clearIntent);
  const setCartOpen = useCartStore((state) => state.setCartOpen);
  const commitBundleApplication = useCartStore((state) => state.commitBundleApplication);
  const removeVoucherEffects = useCartStore((state) => state.removeVoucherEffects);
  const { data: points = 0 } = useCustomerPoints();
  const { data: vouchers = [], isLoading: vouchersLoading } = useCustomerVouchers({ enabled: open && isLoggedIn });
  const { data: packages = [], isLoading: packagesLoading } = useVoucherPackages({ enabled: open });
  const { acquire, isPending } = useVoucherAcquisition();
  const [activeTab, setActiveTab] = useState<VoucherModalTab>("my_vouchers");
  const [pendingPackage, setPendingPackage] = useState<VoucherPackage | null>(null);
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [highlightToken, setHighlightToken] = useState<string | null>(null);
  const [qrVoucher, setQrVoucher] = useState<MyVoucher | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [detailVoucher, setDetailVoucher] = useState<MyVoucher | null>(null);
  const [bundleSetupVoucher, setBundleSetupVoucher] = useState<MyVoucher | null>(null);
  const [refundCandidate, setRefundCandidate] = useState<MyVoucher | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [menuData, setMenuData] = useState<MenuData | undefined>();
  const cartItems = useCartStore((s) => s.items);
  const subtotalVnd = useCartTotalPrice();
  const selectedVoucherIds = useCartStore((s) => s.selectedVoucherIds);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGram = usePowderStore((s) => s.defaultPowderGram);
  const touchStart = useRef({ x: 0, y: 0 });
  useBodyScrollLock(open);

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

  const handleBundleSuccess = useCallback((token: string, allocations: BundleSelectionAllocation[]) => {
    const voucher = activeVouchers.find((candidate) => candidate.qr_token === token);
    const rule = voucher?.package.bundleRule;
    const summary = voucher && rule ? {
      qr_token: voucher.qr_token,
      buy_quantity: rule.buy_quantity,
      reward_quantity: rule.reward_quantity,
      reward_kind: rule.reward_kind,
      reward_mode: rule.reward_mode,
      benefit_scaling: rule.benefit_scaling,
      max_applications_per_order: rule.max_applications_per_order,
      max_reward_units_per_order: rule.max_reward_units_per_order,
      eligible_products: rule.qualifier_products.map((product) => ({ menu_item_id: product.menu_item_id, allowed_sizes: product.allowed_sizes })),
      reward_products: rule.reward_products.map((product) => ({ menu_item_id: product.menu_item_id, allowed_sizes: product.allowed_sizes, baseline_prices_vnd: product.baseline_prices_vnd, baseline_price_vnd: product.baseline_price_vnd })),
      min_order_vnd: voucher.min_order_vnd,
    } : null;
    if (summary) {
      const cart = useCartStore.getState().items;
      const payload = buildBundleApplication({ voucher: summary, cart: summarizeBundleCart(cart), rewardAllocations: allocations });
      commitBundleApplication({
        voucher_qr_token: token,
        owner_key: `customer:${currentUser?.phone ?? "anonymous"}`,
        qualifier_allocations: payload?.qualifier_allocations ?? [],
        reward_allocations: allocations,
        created_reward_effects: cart.filter((item) => item.bundleRewardVoucherToken === token).map((item) => ({ kind: "LINE" as const, client_line_id: item.cartId })),
        status: payload ? "READY" : "NEEDS_CONFIGURATION",
      });
    }
    setBundleSetupVoucher(null);
    setDetailVoucher(null);
    close();
    setCartOpen(true);
  }, [activeVouchers, close, commitBundleApplication, currentUser?.phone, setCartOpen]);

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
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (open) setActiveTab(isLoggedIn ? "my_vouchers" : "packages");
    else if (!isRefunding) setRefundCandidate(null);
  }, [isLoggedIn, isRefunding, open]);

  const acquirePackage = useCallback(async (pkg: VoucherPackage) => {
    setExchangingId(pkg.id);
    try {
      const result = await acquire(pkg);
      setHighlightToken(result.qr_token);
      setActiveTab("my_vouchers");
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
  }, [acquire, points]);

  const handleAcquire = useCallback((pkg: VoucherPackage) => {
    if (!isLoggedIn) {
      close();
      useAuthModalStore.getState().openLoginWithIntent({ type: "voucher_acquire", packageId: pkg.id });
      return;
    }
    if (pkg.acquisition_mode === "POINTS_EXCHANGE") setPendingPackage(pkg);
    else void acquirePackage(pkg);
  }, [acquirePackage, close, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && pendingIntent && !open) openModal();
  }, [isLoggedIn, open, openModal, pendingIntent]);

  useEffect(() => {
    if (!open || !isLoggedIn || !pendingIntent || packagesLoading) return;
    const pkg = packages.find((item) => item.id === pendingIntent.packageId);
    clearIntent();
    setActiveTab("packages");
    if (!pkg) return void toast.error("Gói ưu đãi không còn khả dụng.");
    if (pkg.acquisition_mode === "POINTS_EXCHANGE") setPendingPackage(pkg);
    else void acquirePackage(pkg);
  }, [acquirePackage, clearIntent, isLoggedIn, open, packages, packagesLoading, pendingIntent]);


  const loading = packagesLoading || (isLoggedIn && vouchersLoading);
  const content = (
    <div className="relative flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] bg-background shadow-2xl md:max-h-[85vh] md:max-w-2xl md:rounded-[2.5rem]">
      <header className="z-10 bg-background px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-primary">Ưu đãi</h2>
          <button onClick={close} className="flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring" aria-label="Đóng"><X size={18} /></button>
        </div>
        {isLoggedIn && <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-bold text-primary"><Star size={14} className="text-amber-500" />Điểm của bạn: {points.toLocaleString("vi-VN")} 🐟</p>}
      </header>
      <VoucherModalTabs activeTab={activeTab} isLoggedIn={isLoggedIn} voucherCount={activeVouchers.length} onChange={setActiveTab} />
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchEnd={(event) => {
          const dx = event.changedTouches[0].clientX - touchStart.current.x;
          const dy = event.changedTouches[0].clientY - touchStart.current.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) setActiveTab(getAdjacentVoucherTab(activeTab, dx < 0 ? "left" : "right", isLoggedIn));
        }}
      >
        {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-primary" /></div> : activeTab === "my_vouchers" && isLoggedIn ? (
          activeVouchers.length === 0 ? <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed py-16 text-center"><Ticket className="text-primary/30" /><p className="text-sm font-bold text-primary/60">Bạn chưa có voucher nào</p></div> :
          <div className="grid gap-3 pb-8 sm:grid-cols-2">{activeVouchers.map((voucher) => (
            <VoucherCard key={voucher.qr_token} voucher={voucher} isSelected={highlightToken === voucher.qr_token} onClick={() => setDetailVoucher(voucher)} />
          ))}</div>
        ) : activeTab === "history" && isLoggedIn ? <VoucherHistorySection vouchers={filterHistoryVouchers(vouchers)} /> : (
          <div>
            {!isLoggedIn && <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3"><LogIn className="size-5 shrink-0 text-primary" /><p className="flex-1 text-sm font-bold text-primary">Đăng nhập để nhận hoặc đổi ưu đãi</p><button onClick={() => { close(); useAuthModalStore.getState().openLogin(); }} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-bold text-white">Đăng nhập</button></div>}
            <VoucherPackageCatalog packages={packages} pointsBalance={points} pendingPackageId={isPending ? exchangingId : null} onAcquire={handleAcquire} />
          </div>
        )}
      </div>
      <AnimatePresence>{qrVoucher && <QrModal voucher={qrVoucher} onClose={() => setQrVoucher(null)} />}</AnimatePresence>
      <VoucherAcquisitionConfirm pkg={pendingPackage} pointsBalance={points} isLoading={isPending} onCancel={() => setPendingPackage(null)} onConfirm={() => { if (pendingPackage) void acquirePackage(pendingPackage); }} />

      <AnimatePresence>
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
          menuData={menuData}
          milkTypes={menuData.milk_types}
          powders={powders}
          defaultPowderGram={defaultPowderGram}
          onClose={() => setBundleSetupVoucher(null)}
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
    </div>
  );

  return isDesktop ? (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 p-4 outline-none">{content}</Dialog.Content></Dialog.Portal></Dialog.Root>
  ) : (
    <Drawer.Root open={open} repositionInputs={false} onOpenChange={(next) => { if (!next) close(); }}><Drawer.Portal><Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" /><Drawer.Content className="fixed inset-x-0 bottom-0 z-50 outline-none"><div className="absolute inset-x-0 top-3 z-10 mx-auto h-1.5 w-12 rounded-full bg-border/60" />{content}</Drawer.Content></Drawer.Portal></Drawer.Root>
  );
}
