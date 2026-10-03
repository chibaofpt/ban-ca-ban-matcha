import React, { useEffect, useRef, useState } from "react";
import { CartMoney } from "@/src/components/shared/CartMoney";
import { useAddVoucherToCart } from "@/src/hooks/useAddVoucherToCart";
import { getCartVoucherAvailability, getUsedCartVoucherTokens } from "@/src/lib/utils/cartVoucherAvailability";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { estimateMultiDiscountSavings, isVoucherUsable } from "@/src/utils/voucherMatchUtils";
import { type MyVoucher, type VoucherPackage } from "@/src/services/customerVoucherService";
import { useVoucherAcquisition, type VoucherAcquisitionOptions } from "@/src/hooks/useVoucherAcquisition";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import { VoucherModalDetailTransition, VoucherModalFrame } from "@/src/components/shared/VoucherModalSections";
import { CustomerVoucherHistory } from "@/src/components/shared/CustomerVoucherHistory";
import { VoucherPackageCatalog } from "@/src/components/shared/VoucherPackageCatalog";
import { VoucherAcquisitionConfirm } from "@/src/components/shared/VoucherAcquisitionConfirm";
import { CartDiscountPickerFooter } from "@/src/components/menu/cart/CartDiscountPickerFooter";
import { toast } from "sonner";
import type { BundleCartDraftCommit, CartBundleApplication, ProjectedCartLine } from "@/src/lib/types/cart";
import type { BundleCartDraftResult, BundleCartDraftValidation } from "@/src/lib/utils/bundleCartDraft";
import type { MenuData } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { VoucherDetailSheet } from "@/src/components/shared/VoucherDetailSheet";
import { AddonItemPicker } from "@/src/components/shared/AddonItemPicker";
import {
  buildVoucherActionModel,
  productDiscountMatchesBaseLiquid,
  selectOrderVoucherToken,
} from "@/src/utils/customerVoucherSelection";
import { type VoucherModalTab } from "@/src/lib/utils/voucherModalHelpers";
import { BundleVoucherSetupSheet } from "@/src/components/shared/BundleVoucherSetupSheet";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { validateBundleCartDraft } from "@/src/lib/utils/bundleCartDraft";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { resolveBundleSelectionSiblings } from "@/src/lib/utils/bundleVoucher";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import type { PendingAddonVoucherIntent } from "@/src/lib/store/cartStore";

interface CartDiscountPickerProps {
  open: boolean;
  onAfterClose?: () => void;
  onAddVoucherItem?: (item: Omit<import("@/src/lib/types/cart").CartItem, "cartId">) => CartMutationResult<unknown>;
  discountVouchers: MyVoucher[];
  freeshipVouchers: MyVoucher[];
  productDiscountVouchers: MyVoucher[];
  availableVoucherPackages: VoucherPackage[];
  pointsBalance: number;
  isLoading: boolean;
  loadError: boolean;
  selectedVoucherIds: string[];
  selectedDiscountVouchers: MyVoucher[];
  selectedFreeshipVouchers: MyVoucher[];
  subtotalPrice: number;
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
  onClose: () => void;
  onUpdateSelectedVouchers: React.Dispatch<React.SetStateAction<string[]>>;
  onRefreshVouchers: () => Promise<MyVoucher[]>;
  bundleVouchers: MyVoucher[];
  cart: ProjectedCartLine[];
  menuData: MenuData;
  powders: Powder[];
  defaultPowderGram: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }>;
  getProductVoucherBenefit: (item: ProjectedCartLine, voucher: MyVoucher) => number;
  onApplyProductVoucher: (cartId: string, voucher: MyVoucher) => void;
  onRemoveProductVoucher: (cartId: string) => void;
  onRemoveAddonVoucher: (cartId: string, voucherId: string) => void;
  bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>;
  bundleApplications: CartBundleApplication[];
  bundleOwnerKey: string;
  onCommitBundleCartDraft: (draft: BundleCartDraftCommit) => CartMutationResult;
  onRequestRemoveBundle: (voucherToken: string) => void;
  /** PRODUCT + ITEM vouchers eligible for "Dùng ngay". */
  productVouchers: MyVoucher[];
  /** ADDON vouchers eligible for "Dùng ngay". */
  addonVouchers: MyVoucher[];
  /** Callback when PRODUCT/ITEM voucher "Dùng ngay" is pressed. */
  onUseProductVoucher: (voucher: MyVoucher) => void;
  /** Optional adapters let staff reuse this picker without mutating the customer cart store. */
  onApplyAddonVoucher?: (
    cartId: string,
    voucherId: string,
    addonOptionId: string,
    context: {
      groupOptionIds: string[];
      maxSelect: number;
      isExtraMatcha: boolean;
      replaceOptionId?: string;
    },
  ) => CartMutationResult;
  onSavePendingAddonVoucher?: (intent: PendingAddonVoucherIntent) => void;
  acquisitionOptions?: VoucherAcquisitionOptions;
  onAcquired?: (voucherPackage: VoucherPackage) => void;
  isSelectionContextCurrent?: (voucherToken?: string) => boolean;
  tabs?: VoucherModalTab[];
  title?: string;
  pointsLabel?: string;
  voucherTabLabel?: string;
  emptyWalletLabel?: string;
}

type VoucherPickerView =
  | { kind: "list" }
  | { kind: "detail"; voucher: MyVoucher }
  | { kind: "product-target"; voucher: MyVoucher }
  | { kind: "addon-target"; voucher: MyVoucher }
  | { kind: "bundle-setup"; voucher: MyVoucher };

export const CartDiscountPicker = ({
  open,
  onAfterClose,
  onAddVoucherItem,
  discountVouchers,
  freeshipVouchers,
  productDiscountVouchers,
  availableVoucherPackages,
  pointsBalance,
  isLoading,
  loadError,
  selectedVoucherIds,
  selectedDiscountVouchers,
  selectedFreeshipVouchers,
  subtotalPrice,
  orderType,
  shippingFee,
  onClose,
  onUpdateSelectedVouchers,
  onRefreshVouchers,
  bundleVouchers,
  cart,
  menuData,
  powders,
  defaultPowderGram,
  getProductVoucherBenefit,
  onApplyProductVoucher,
  onRemoveProductVoucher,
  onRemoveAddonVoucher,
  bundleAllocatedQuantitiesByCartId,
  bundleApplications,
  bundleOwnerKey,
  onCommitBundleCartDraft,
  onRequestRemoveBundle,
  productVouchers,
  addonVouchers,
  onApplyAddonVoucher,
  onSavePendingAddonVoucher,
  acquisitionOptions,
  onAcquired,
  isSelectionContextCurrent,
  tabs,
  title,
  pointsLabel,
  voucherTabLabel,
  emptyWalletLabel = "Bạn chưa có mã ưu đãi nào",
}: CartDiscountPickerProps) => {
  const router = useRouter();
  const { addToCart, loading: addingVoucherItem } = useAddVoucherToCart({ openCartOnSuccess: false, onAddItem: onAddVoucherItem });
  const pendingUse = useRef<string | null>(null);
  const closeAfterChild = useRef(false);
  const pickerOpen = useRef(open);
  useEffect(() => { pickerOpen.current = open; pendingUse.current = null; }, [open, bundleOwnerKey]);
  const [productChildOpen, setProductChildOpen] = useState(false);
  const [bundleClosing, setBundleClosing] = useState(false);
  const [targetClosing, setTargetClosing] = useState(false);
  const { acquire, retryRefresh, receipt, isPending } = useVoucherAcquisition({
    ...acquisitionOptions,
    refreshWallet: onRefreshVouchers,
  });
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [isRetryingWallet, setIsRetryingWallet] = useState(false);
  const [confirmPackage, setConfirmPackage] = useState<VoucherPackage | null>(null);
  const [activeView, setActiveView] = useState<VoucherPickerView>({ kind: "list" });
  const [activeTab, setActiveTab] = useState<VoucherModalTab>("my_vouchers");

  const myVouchers = [
    ...discountVouchers, ...freeshipVouchers, ...productDiscountVouchers,
    ...bundleVouchers, ...productVouchers, ...addonVouchers,
  ];
  const voucherContext = { menuData, powders, defaultPowderGram, selectedDiscountVouchers, subtotalPrice, orderType, shippingFee };
  const usedTokens = getUsedCartVoucherTokens(cart, bundleApplications);
  const typePriority = (voucher: MyVoucher) => voucher.voucher_type === "DISCOUNT" ? 0 : voucher.voucher_type === "FREESHIP" ? 1 : 2;
  const voucherRows = (open || activeView.kind !== "list" ? myVouchers : [])
    .filter((voucher) => ["DISCOUNT", "FREESHIP"].includes(voucher.voucher_type) || !usedTokens.has(voucher.qr_token))
    .map((voucher) => ({ voucher, availability: getCartVoucherAvailability(voucher, voucherContext) }))
    .sort((left, right) => Number(right.availability.canUse) - Number(left.availability.canUse) ||
      typePriority(left.voucher) - typePriority(right.voucher));
  const selectedViewVoucher = activeView.kind === "list" ? null
    : myVouchers.find((voucher) => voucher.qr_token === activeView.voucher.qr_token) ?? activeView.voucher;
  const detailVoucher = activeView.kind === "detail" ? selectedViewVoucher : null;
  const targetVoucher = activeView.kind === "product-target" ? selectedViewVoucher : null;
  const addonTargetVoucher = activeView.kind === "addon-target" ? selectedViewVoucher : null;
  const bundleSetupVoucher = activeView.kind === "bundle-setup" ? selectedViewVoucher : null;
  const selectionContextIsCurrent = (voucherToken?: string) => !isLoading && !loadError &&
    (isSelectionContextCurrent?.(voucherToken) ?? true) && (!voucherToken ||
      myVouchers.some((voucher) => voucher.qr_token === voucherToken && isVoucherUsable(voucher)));
  const hasAppliedNonBundleVoucher = selectedVoucherIds.length > 0 || cart.some((item) =>
    Boolean(item.lineVoucher) || item.addonVouchers.length > 0,
  );

  const productTargets = (voucher: MyVoucher) => cart.flatMap((item) => {
    const matchesProduct = (voucher.eligible_menu_items?.length ?? 0) > 0
      ? voucher.eligible_menu_items!.some((target) => target.menu_item_id === item.menuItemId)
      : voucher.menu_item_id === item.menuItemId;
    const benefit = getProductVoucherBenefit(item, voucher);
    const size = item.configuration.size;
    const matchesBaseLiquid = item.configuration.size !== null &&
      productDiscountMatchesBaseLiquid(
        voucher,
        item.menuItemId,
        item.configuration.baseLiquidId ?? item.menuItem?.default_base_liquid_id,
      );
    return matchesProduct && matchesBaseLiquid && size !== null && (voucher.eligible_sizes ?? []).includes(size) &&
      (bundleAllocatedQuantitiesByCartId.get(item.cartId) ?? 0) < item.quantity && benefit > 0
      ? [{ cartId: item.cartId, menuItemId: item.menuItemId, size, estimatedBenefitVnd: benefit }]
      : [];
  });

  const acquirePackage = async (pkg: VoucherPackage) => {
    try {
      setRedeemingId(pkg.id);
      const result = await acquire(pkg);
      if (!selectionContextIsCurrent()) return;
      setConfirmPackage(null);
      onAcquired?.(pkg);
      const newVoucher = result.acquired;
      const refreshedVoucher = result.wallet?.find((voucher) => voucher.qr_token === newVoucher.qr_token);
      const acquiredSelection = refreshedVoucher ?? {
        qr_token: newVoucher.qr_token,
        voucher_type: newVoucher.voucher_type,
        discount_type: pkg.discount_type,
      };
      if (!result.refreshError && refreshedVoucher && isVoucherUsable(refreshedVoucher) && (isSelectionContextCurrent?.(refreshedVoucher.qr_token) ?? true) && newVoucher.voucher_type === "BUNDLE") {
        if (refreshedVoucher) setActiveView({ kind: "bundle-setup", voucher: refreshedVoucher });
      } else if (!result.refreshError && refreshedVoucher && isVoucherUsable(refreshedVoucher) && (isSelectionContextCurrent?.(refreshedVoucher.qr_token) ?? true)) {
        onUpdateSelectedVouchers((previous) =>
          selectOrderVoucherToken(previous, acquiredSelection, [...myVouchers, acquiredSelection]));
      }
      if (result.refreshError) toast.warning("Đã nhận voucher. Hãy làm mới ví để xem chi tiết.");
      toast.success(pkg.acquisition_mode === "FREE_CLAIM" ? "Đã nhận voucher" : "Đổi voucher thành công");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
      toast.error(`Không thể nhận ưu đãi: ${message}`);
    } finally {
      setRedeemingId(null);
    }
  };

  const handleRetryWalletRefresh = async () => {
    if (!receipt || isRetryingWallet) return;
    setIsRetryingWallet(true);
    try {
      const result = await retryRefresh();
      if (result && selectionContextIsCurrent()) {
        const refreshedVoucher = result.wallet?.find((voucher) => voucher.qr_token === result.acquired.qr_token);
        if (refreshedVoucher && isVoucherUsable(refreshedVoucher) && (isSelectionContextCurrent?.(refreshedVoucher.qr_token) ?? true) && refreshedVoucher.voucher_type === "BUNDLE") {
          setActiveView({ kind: "bundle-setup", voucher: refreshedVoucher });
        } else if (refreshedVoucher && isVoucherUsable(refreshedVoucher) && (isSelectionContextCurrent?.(refreshedVoucher.qr_token) ?? true)) {
          onUpdateSelectedVouchers((previous) =>
            selectOrderVoucherToken(previous, refreshedVoucher, [...myVouchers, refreshedVoucher]));
        }
        toast.success("Đã cập nhật ví voucher.");
      }
    } catch {
      toast.error("Chưa thể cập nhật ví. Bạn có thể thử lại.");
    } finally {
      setIsRetryingWallet(false);
    }
  };

  const handleAcquire = (pkg: VoucherPackage) => {
    if (pkg.acquisition_mode === "POINTS_EXCHANGE") setConfirmPackage(pkg);
    else void acquirePackage(pkg);
  };

  const selectedOrderDiscount = estimateMultiDiscountSavings(
    selectedDiscountVouchers,
    subtotalPrice
  );
  const selectedFreeshipVoucher = selectedFreeshipVouchers[0] ?? null;
  const totalAfterSelectedDiscount = subtotalPrice - selectedOrderDiscount;
  const selectedFreeshipDiscount =
    orderType === "DELIVERY" &&
    selectedFreeshipVoucher &&
    (selectedFreeshipVoucher.min_order_vnd === null ||
      totalAfterSelectedDiscount >= selectedFreeshipVoucher.min_order_vnd)
      ? Math.min(
          shippingFee ?? 0,
          selectedFreeshipVoucher.covered_delivery_fee_vnd ?? 0
        )
      : 0;
  const acquisitionReceiptView = receipt ? (
    <div className="mb-3 rounded-2xl border border-border bg-muted/50 px-3 py-2.5" role="status" aria-live="polite">
      <p className="text-sm font-bold text-primary">Đã nhận voucher</p>
      <p className="mt-1 break-all text-xs text-primary">Mã: {receipt.acquired.qr_token}</p>
      {receipt.refreshError ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-xs text-primary">Ví chưa cập nhật, voucher vẫn đã được ghi nhận.</p>
          <button
            type="button"
            onClick={() => void handleRetryWalletRefresh()}
            disabled={isRetryingWallet}
            className="min-h-11 shrink-0 rounded-xl border border-border bg-card px-3 text-xs font-bold text-primary disabled:opacity-60"
          >
            {isRetryingWallet ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
            Làm mới ví
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const finishVoucherUse = () => { pendingUse.current = null; onClose(); };
  const handleMenuVoucherUse = async (voucher: MyVoucher) => {
    if (pendingUse.current || !selectionContextIsCurrent(voucher.qr_token)) return;
    const availability = getCartVoucherAvailability(voucher, voucherContext);
    if (!availability.canUse) return;
    if (availability.targets.length !== 1) { setActiveView({ kind: "detail", voucher }); return; }
    pendingUse.current = voucher.qr_token;
    const canCommit = () => pickerOpen.current && pendingUse.current === voucher.qr_token && selectionContextIsCurrent(voucher.qr_token);
    try {
      const result = await addToCart(voucher, availability.targets[0], canCommit);
      if (!canCommit()) return;
      if (result.ok) finishVoucherUse();
      else toast.error(result.reason === "no_benefit" ? "Voucher không tạo thêm ưu đãi cho món này"
        : "Không thể thêm món và áp voucher. Vui lòng kiểm tra lại.");
    } finally { if (pendingUse.current === voucher.qr_token) pendingUse.current = null; }
  };
  const closePicker = () => {
    pendingUse.current = null;
    if (activeView.kind === "product-target" || activeView.kind === "addon-target" || activeView.kind === "bundle-setup") { setActiveView({ kind: "list" }); return; }
    onClose();
  };

  const handleRetryWalletLoad = async () => {
    if (isRetryingWallet) return;
    setIsRetryingWallet(true);
    try {
      await onRefreshVouchers();
    } catch {
      toast.error("Chưa thể tải ví voucher. Vui lòng thử lại.");
    } finally {
      setIsRetryingWallet(false);
    }
  };

  const clearAppliedNonBundleVouchers = () => {
    if (!selectionContextIsCurrent()) return;
    onUpdateSelectedVouchers([]);
    for (const item of cart) {
      if (item.lineVoucher) onRemoveProductVoucher(item.cartId);
      for (const addonVoucher of item.addonVouchers) {
        onRemoveAddonVoucher(item.cartId, addonVoucher.token);
      }
    }
  };
  const detailProductItem = detailVoucher?.voucher_type === "PRODUCT_DISCOUNT"
    ? cart.find((item) => item.lineVoucher?.token === detailVoucher.qr_token)
    : undefined;
  const detailHasOrderVoucher = detailVoucher
    ? selectedVoucherIds.includes(detailVoucher.qr_token)
    : false;
  const detailHasBundle = detailVoucher?.voucher_type === "BUNDLE"
    ? bundleApplications.some((application) => application.voucher_qr_token === detailVoucher.qr_token)
    : false;
  const removeAppliedDetailVoucher = detailVoucher && (detailProductItem || detailHasOrderVoucher || detailHasBundle)
    ? () => {
        if (!selectionContextIsCurrent()) return;
        if (detailProductItem) onRemoveProductVoucher(detailProductItem.cartId);
        else if (detailHasBundle) onRequestRemoveBundle(detailVoucher.qr_token);
        else onUpdateSelectedVouchers((previous) => previous.filter((token) => token !== detailVoucher.qr_token));
        setActiveView({ kind: "list" });
      }
    : undefined;
  return (
    <ResponsiveOverlay
      open={open || productChildOpen || bundleSetupVoucher !== null || targetVoucher !== null || addonTargetVoucher !== null}
      onOpenChange={(open) => { if (!open) closePicker(); }}
      layer="nested"
      onAfterClose={() => { setActiveView({ kind: "list" }); setConfirmPackage(null); onAfterClose?.(); }}
      title="Mã ưu đãi"
      presentation="bare"
      className="w-full md:max-w-2xl"
    >
      <VoucherModalFrame
        activeTab={activeTab}
        isLoggedIn
        voucherCount={myVouchers.length}
        pointsBalance={pointsBalance}
        title={title}
        pointsLabel={pointsLabel}
        tabs={tabs}
        voucherTabLabel={voucherTabLabel}
        onChange={setActiveTab}
        onClose={closePicker}
        detailOpen={detailVoucher !== null}
        headerAction={activeTab === "my_vouchers" && !isLoading && !loadError && hasAppliedNonBundleVoucher ? (
          <button
            type="button"
            onClick={clearAppliedNonBundleVouchers}
            className="min-h-11 shrink-0 rounded-full bg-red-50 px-3 text-xs font-bold text-destructive transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Bỏ tất cả
          </button>
        ) : null}
        footer={activeTab === "my_vouchers" ? (
          <CartDiscountPickerFooter selectedVoucherIds={selectedVoucherIds} selectedDiscountVouchers={selectedDiscountVouchers} subtotalPrice={subtotalPrice} freeshipDiscount={selectedFreeshipDiscount} onConfirm={closePicker} />
        ) : null}
        overlayContent={(
          <>
            <VoucherAcquisitionConfirm
              pkg={confirmPackage}
              pointsBalance={pointsBalance}
              isLoading={isPending}
              onCancel={() => setConfirmPackage(null)}
              onConfirm={() => { if (confirmPackage) void acquirePackage(confirmPackage); }}
            />
            <VoucherModalDetailTransition>
              {detailVoucher ? (
                <VoucherDetailSheet
                  overlayOpen={open}
                  onChildOpenChange={setProductChildOpen}
                  key="cart-voucher-detail"
                  voucher={detailVoucher}
                  cartItems={cart}
                  subtotalVnd={subtotalPrice}
                  myVouchers={myVouchers}
                  orderType={orderType}
                  shippingFee={shippingFee}
                  menuData={menuData}
                  canEdit={selectedViewVoucher !== null && selectionContextIsCurrent(selectedViewVoucher.qr_token)}
                  editDisabledReason={loadError ? "Không thể xác minh ví voucher. Hãy thử lại." : ""}
                  onAddVoucherItem={onAddVoucherItem ? (item) => selectionContextIsCurrent(detailVoucher.qr_token) ? onAddVoucherItem(item) : { ok: false, code: "BUNDLE_STALE", message: "Ví voucher đang được xác minh lại." } : undefined}
                  bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
                  onBack={() => setActiveView({ kind: "list" })}
                  onUseNowSuccess={finishVoucherUse}
                  totalAfterDiscountVnd={totalAfterSelectedDiscount}
                  onOpenBundleSetup={(voucher) => { if (selectionContextIsCurrent(voucher.qr_token)) setActiveView({ kind: "bundle-setup", voucher }); }}
                  onRequestRefund={() => undefined}
                  isRefunding={false}
                  onRemoveAppliedVoucher={removeAppliedDetailVoucher}
                  onSelectOrderVoucher={(voucher) => {
                    if (!selectionContextIsCurrent(voucher.qr_token)) return;
                    onUpdateSelectedVouchers((previous) =>
                      selectOrderVoucherToken(previous, voucher, myVouchers));
                  }}
                  onApplyAddonVoucher={onApplyAddonVoucher ? (...args) => selectionContextIsCurrent(args[1]) ? onApplyAddonVoucher(...args) : { ok: false, code: "BUNDLE_STALE", message: "Ví voucher đang được xác minh lại." } : undefined}
                  onSavePendingAddonVoucher={onSavePendingAddonVoucher ? (intent) => { if (selectionContextIsCurrent(intent.voucherId)) onSavePendingAddonVoucher(intent); } : undefined}
                  onPendingAddon={() => {
                    setActiveView({ kind: "list" });
                    onClose();
                  }}
                  onSelectProductDiscountTarget={(voucher) => void handleMenuVoucherUse(voucher)}
                  onUseProductVoucher={(voucher) => void handleMenuVoucherUse(voucher)}
                />
              ) : null}
            </VoucherModalDetailTransition>
          </>
        )}
      >
        {activeTab === "my_vouchers" && <section>
          {acquisitionReceiptView}
          {loadError ? (
            <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
              <p className="text-sm font-bold text-red-900">Không thể tải ví voucher</p>
              <button
                type="button"
                onClick={() => void handleRetryWalletLoad()}
                disabled={isRetryingWallet}
                className="min-h-11 rounded-xl border border-red-300 bg-card px-4 text-xs font-bold text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:opacity-60"
              >
                {isRetryingWallet ? <Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden="true" /> : null}
                Thử lại
              </button>
            </div>
          ) : null}
          {isLoading && myVouchers.length === 0 ? (
            <div
              role="status"
              aria-label="Đang tải voucher"
              className="flex min-h-40 items-center justify-center"
            >
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              <span className="sr-only">Đang tải voucher</span>
            </div>
          ) : !loadError && voucherRows.length === 0 ? (
            <div className="text-center py-6 bg-card rounded-2xl border border-dashed border-border/60">
              <p className="text-xs text-primary/40 font-medium">{emptyWalletLabel}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {voucherRows.map(({ voucher: v, availability }) => {
                const isSelected = selectedVoucherIds.includes(v.qr_token);
                const isOrderVoucher = v.voucher_type === "DISCOUNT" || v.voucher_type === "FREESHIP";
                const handleSelection = () => {
                  if (!selectionContextIsCurrent()) return;
                  if (isOrderVoucher) {
                    if (isSelected) {
                      onUpdateSelectedVouchers((previous) => previous.filter((token) => token !== v.qr_token));
                    } else if (availability.canUse && selectionContextIsCurrent(v.qr_token)) {
                      onUpdateSelectedVouchers((previous) => selectOrderVoucherToken(previous, v, myVouchers));
                    }
                    return;
                  }
                  if (!availability.canUse || !selectionContextIsCurrent(v.qr_token)) return;
                  if (v.voucher_type === "BUNDLE") setActiveView({ kind: "bundle-setup", voucher: v });
                  else if (v.voucher_type === "ADDON") setActiveView({ kind: "detail", voucher: v });
                  else void handleMenuVoucherUse(v);
                };
                return (
                  <VoucherCard key={v.qr_token} voucher={v}
                    isDisabled={!availability.canUse} disabledReason={availability.reason}
                    isSelected={isSelected}
                    onClick={() => setActiveView({ kind: "detail", voucher: v })}
                    onAction={handleSelection}
                    actionModel={isOrderVoucher ? buildVoucherActionModel({
                      context: "cart", selected: isSelected,
                      selectable: selectionContextIsCurrent() && (isSelected || availability.canUse),
                      disabledReason: availability.reason || null, estimatedBenefitVnd: 0,
                    }) : buildVoucherActionModel({
                      context: "wallet", busy: addingVoucherItem,
                      label: ["PRODUCT", "PRODUCT_DISCOUNT", "ITEM"].includes(v.voucher_type) && availability.targets.length === 1
                        ? "Dùng ngay" : "Chọn món",
                      selectable: !addingVoucherItem && availability.canUse && selectionContextIsCurrent(),
                      disabledReason: availability.reason || null,
                    })}
                  />
                );
              })}
            </div>
          )}
        </section>}

        {/* Section 2: Receive or exchange a voucher */}
        {activeTab === "packages" && (
          <VoucherPackageCatalog
            packages={availableVoucherPackages}
            menuData={menuData}
            pointsBalance={pointsBalance}
            pendingPackageId={isPending ? redeemingId : null}
            onAcquire={handleAcquire}
            columns="one"
          />
        )}

        {activeTab === "history" && (
          <CustomerVoucherHistory
            onVoucherClick={(voucher) => setActiveView({ kind: "detail", voucher })}
          />
        )}
      </VoucherModalFrame>
      <ResponsiveOverlay
        open={open && !targetClosing && targetVoucher !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setTargetClosing(true); }}
        onAfterClose={() => { setActiveView({ kind: "list" }); setTargetClosing(false); if (closeAfterChild.current) { closeAfterChild.current = false; finishVoucherUse(); } }}
        layer="critical"
        title="Chọn món áp dụng"
      >
        <div className="space-y-2 p-4">
          {targetVoucher ? productTargets(targetVoucher).map((target) => {
            const item = cart.find((candidate) => candidate.cartId === target.cartId);
            return (
              <button
                key={target.cartId}
                disabled={!selectionContextIsCurrent(targetVoucher.qr_token)}
                type="button"
                onClick={() => {
                  if (!selectionContextIsCurrent(targetVoucher.qr_token)) return;
                  onApplyProductVoucher(target.cartId, targetVoucher);
                  setTargetClosing(true);
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  <span className="block text-sm font-bold">{item?.name}</span>
                  <span className="block text-xs text-muted-foreground">Size <SizeLabel size={target.size} /></span>
                </span>
                <span className="text-sm font-bold text-red-700"><CartMoney amountVnd={target.estimatedBenefitVnd} discount /></span>
              </button>
            );
          }) : null}
        </div>
      </ResponsiveOverlay>
      <ResponsiveOverlay
        open={open && !targetClosing && addonTargetVoucher !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setTargetClosing(true); }}
        onAfterClose={() => { setActiveView({ kind: "list" }); setTargetClosing(false); if (closeAfterChild.current) { closeAfterChild.current = false; finishVoucherUse(); } }}
        layer="critical"
        title="Chọn món áp dụng"
      >
        {addonTargetVoucher ? (
          <AddonItemPicker
            voucher={addonTargetVoucher}
            cartItems={cart}
            bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
            menuData={menuData}
            canEdit={selectedViewVoucher !== null && selectionContextIsCurrent(selectedViewVoucher.qr_token)}
            onBack={() => setTargetClosing(true)}
            onSuccess={() => { closeAfterChild.current = true; setTargetClosing(true); }}
            onApplyVoucher={onApplyAddonVoucher ? (...args) => selectionContextIsCurrent(args[1]) ? onApplyAddonVoucher(...args) : { ok: false, code: "BUNDLE_STALE", message: "Ví voucher đang được xác minh lại." } : undefined}
            onSavePendingVoucher={onSavePendingAddonVoucher ? (intent) => { if (selectionContextIsCurrent(intent.voucherId)) onSavePendingAddonVoucher(intent); } : undefined}
            onPending={() => {
              setTargetClosing(true);
              onClose();
              if (!onSavePendingAddonVoucher) router.push("/menu");
            }}
          />
        ) : null}
      </ResponsiveOverlay>
      {bundleSetupVoucher ? (
        <BundleVoucherSetupSheet
          open={open && !bundleClosing}
          layer="critical"
          voucher={bundleSetupVoucher}
          cartItems={cart}
          bundleApplications={bundleApplications}
          initialApplication={bundleApplications.find((application) => application.voucher_qr_token === bundleSetupVoucher.qr_token)}
          menuData={menuData}
          milkTypes={menuData.milk_types}
          powders={powders}
          defaultPowderGram={defaultPowderGram}
          onClose={() => setBundleClosing(true)}
          onAfterClose={() => { setActiveView({ kind: "list" }); setBundleClosing(false); if (closeAfterChild.current) { closeAfterChild.current = false; finishVoucherUse(); } }}
          onValidateDraft={(candidate: BundleCartDraftResult): BundleCartDraftValidation => {
            if (!selectionContextIsCurrent(bundleSetupVoucher.qr_token)) return { ok: false, error: "Ví voucher đang được xác minh lại." };
            const summary = getBundleVoucherSummary(bundleSetupVoucher);
            if (!summary) return { ok: false, error: "Voucher BUNDLE không còn khả dụng" };
            const siblingResolution = resolveBundleSelectionSiblings({
              current_qr_token: bundleSetupVoucher.qr_token,
              applications: bundleApplications,
              summaries: bundleVouchers.flatMap((voucher) => {
                const resolved = getBundleVoucherSummary(voucher);
                return resolved ? [resolved] : [];
              }),
            });
            if (!siblingResolution.ok) return siblingResolution;
            return validateBundleCartDraft({ voucher: summary, candidate, ownerKey: bundleOwnerKey, siblingApplications: siblingResolution.siblings });
          }}
          onCommitDraft={(draft) => selectionContextIsCurrent(bundleSetupVoucher.qr_token) ? onCommitBundleCartDraft(draft) : { ok: false, code: "BUNDLE_STALE", message: "Ví voucher đang được xác minh lại." }}
          onSuccess={() => { closeAfterChild.current = true; setBundleClosing(true); }}
        />
      ) : null}
    </ResponsiveOverlay>
  );
};
