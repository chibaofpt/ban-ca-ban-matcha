import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
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
import { buildVoucherActionModel, getProductDiscountSelection, selectOrderVoucherToken } from "@/src/utils/customerVoucherSelection";
import { getVoucherAvailabilityMessage, type VoucherModalTab } from "@/src/lib/utils/voucherModalHelpers";
import { BundleVoucherSetupSheet } from "@/src/components/shared/BundleVoucherSetupSheet";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { validateBundleCartDraft } from "@/src/lib/utils/bundleCartDraft";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { resolveBundleSelectionSiblings } from "@/src/lib/utils/bundleVoucher";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import type { PendingAddonVoucherIntent } from "@/src/lib/store/cartStore";

interface CartDiscountPickerProps {
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
  isSelectionContextCurrent?: () => boolean;
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
  onUseProductVoucher,
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
  const { acquire, retryRefresh, receipt, isPending } = useVoucherAcquisition({
    ...acquisitionOptions,
    refreshWallet: onRefreshVouchers,
  });
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [isRetryingWallet, setIsRetryingWallet] = useState(false);
  const [confirmPackage, setConfirmPackage] = useState<VoucherPackage | null>(null);
  const [activeView, setActiveView] = useState<VoucherPickerView>({ kind: "list" });
  const [activeTab, setActiveTab] = useState<VoucherModalTab>("my_vouchers");
  const detailVoucher = activeView.kind === "detail" ? activeView.voucher : null;
  const targetVoucher = activeView.kind === "product-target" ? activeView.voucher : null;
  const addonTargetVoucher = activeView.kind === "addon-target" ? activeView.voucher : null;
  const bundleSetupVoucher = activeView.kind === "bundle-setup" ? activeView.voucher : null;
  const selectionContextIsCurrent = () => isSelectionContextCurrent?.() ?? true;

  const myVouchers = [
    ...discountVouchers, ...freeshipVouchers, ...productDiscountVouchers,
    ...bundleVouchers, ...productVouchers, ...addonVouchers,
  ];
  const hasAppliedNonBundleVoucher = selectedVoucherIds.length > 0 || cart.some((item) =>
    Boolean(item.lineVoucher) || item.addonVouchers.length > 0,
  );

  const productTargets = (voucher: MyVoucher) => cart.flatMap((item) => {
    const matchesProduct = (voucher.eligible_menu_items?.length ?? 0) > 0
      ? voucher.eligible_menu_items!.some((target) => target.menu_item_id === item.menuItemId)
      : voucher.menu_item_id === item.menuItemId;
    const benefit = getProductVoucherBenefit(item, voucher);
    const size = item.configuration.size;
    return matchesProduct && size !== null && (voucher.eligible_sizes ?? []).includes(size) &&
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
      if (!result.refreshError && newVoucher.voucher_type === "BUNDLE") {
        if (refreshedVoucher) setActiveView({ kind: "bundle-setup", voucher: refreshedVoucher });
      } else if (!result.refreshError) {
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
        if (refreshedVoucher?.voucher_type === "BUNDLE") {
          setActiveView({ kind: "bundle-setup", voucher: refreshedVoucher });
        } else if (refreshedVoucher) {
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
    <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5" role="status" aria-live="polite">
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

  const closePicker = () => {
    setActiveView({ kind: "list" });
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
        if (detailProductItem) onRemoveProductVoucher(detailProductItem.cartId);
        else if (detailHasBundle) onRequestRemoveBundle(detailVoucher.qr_token);
        else onUpdateSelectedVouchers((previous) => previous.filter((token) => token !== detailVoucher.qr_token));
        setActiveView({ kind: "list" });
      }
    : undefined;
  return (
    <ResponsiveOverlay
      open
      onOpenChange={(open) => { if (!open) closePicker(); }}
      layer="nested"
      nested
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
            className="min-h-11 shrink-0 rounded-full bg-red-50 px-3 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-ring"
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
                  key="cart-voucher-detail"
                  voucher={detailVoucher}
                  cartItems={cart}
                  subtotalVnd={subtotalPrice}
                  myVouchers={myVouchers}
                  orderType={orderType}
                  shippingFee={shippingFee}
                  menuData={menuData}
                  canEdit={!isLoading}
                  bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
                  onBack={() => setActiveView({ kind: "list" })}
                  onUseNowSuccess={() => setActiveView({ kind: "list" })}
                  onOpenBundleSetup={(voucher) => setActiveView({ kind: "bundle-setup", voucher })}
                  onRequestRefund={() => undefined}
                  isRefunding={false}
                  onRemoveAppliedVoucher={removeAppliedDetailVoucher}
                  onSelectOrderVoucher={(voucher) => {
                    if (!selectionContextIsCurrent()) return;
                    onUpdateSelectedVouchers((previous) =>
                      selectOrderVoucherToken(previous, voucher, myVouchers));
                  }}
                  onApplyAddonVoucher={onApplyAddonVoucher}
                  onSavePendingAddonVoucher={onSavePendingAddonVoucher}
                  onPendingAddon={() => {
                    setActiveView({ kind: "list" });
                    onClose();
                  }}
                  onSelectProductDiscountTarget={(voucher) => {
                    const selection = getProductDiscountSelection(productTargets(voucher), null);
                    if (selection.kind === "single") {
                      onApplyProductVoucher(selection.target.cartId, voucher);
                      setActiveView({ kind: "list" });
                    } else if (selection.kind === "multiple") {
                      setActiveView({ kind: "product-target", voucher });
                    } else {
                      toast.error(selection.reason);
                    }
                  }}
                  onUseProductVoucher={(voucher) => {
                    onUseProductVoucher(voucher);
                    setActiveView({ kind: "list" });
                  }}
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
                className="min-h-11 rounded-xl border border-red-300 bg-white px-4 text-xs font-bold text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:opacity-60"
              >
                {isRetryingWallet ? <Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden="true" /> : null}
                Thử lại
              </button>
            </div>
          ) : isLoading ? (
            <div
              role="status"
              aria-label="Đang tải voucher"
              className="flex min-h-40 items-center justify-center"
            >
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
              <span className="sr-only">Đang tải voucher</span>
            </div>
          ) : myVouchers.length === 0 ? (
            <div className="text-center py-6 bg-white rounded-2xl border border-dashed border-border/60">
              <p className="text-xs text-primary/40 font-medium">{emptyWalletLabel}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {myVouchers.map((v) => {
                const selectedCartItem = cart.find((item) =>
                  item.lineVoucher?.token === v.qr_token ||
                  item.addonVouchers.some((addonVoucher) => addonVoucher.token === v.qr_token),
                );
                const selectedProductItem = v.voucher_type === "PRODUCT_DISCOUNT" && selectedCartItem?.lineVoucher?.token === v.qr_token
                  ? selectedCartItem
                  : undefined;
                const selectedBundle = v.voucher_type === "BUNDLE"
                  ? bundleApplications.some((application) => application.voucher_qr_token === v.qr_token)
                  : false;
                const isSelected = selectedVoucherIds.includes(v.qr_token) || Boolean(selectedCartItem) || selectedBundle;
                const selectedOrderDiscount = selectedDiscountVouchers;
                const currentOrderDiscount = estimateMultiDiscountSavings(
                  selectedOrderDiscount,
                  subtotalPrice
                );
                const candidateOrderDiscount = v.voucher_type === "DISCOUNT"
                  ? estimateMultiDiscountSavings(
                      v.discount_type === "PERCENT"
                        ? [
                            ...selectedOrderDiscount.filter(
                              (selected) => selected.discount_type !== "PERCENT"
                            ),
                            v,
                          ]
                        : [...selectedOrderDiscount, v],
                      subtotalPrice
                    )
                  : currentOrderDiscount;
                const amountBeforeShipping = subtotalPrice - currentOrderDiscount;

                let isDisabled = v.status !== "ACTIVE" || !v.availability.can_apply;
                let disabledReason = isDisabled
                  ? getVoucherAvailabilityMessage(v) ?? "Voucher hiện chưa thể áp dụng"
                  : "";
                if (!isSelected && !isDisabled && v.voucher_type === "DISCOUNT") {
                  if (v.min_order_vnd !== null && subtotalPrice < v.min_order_vnd) {
                    isDisabled = true;
                    disabledReason = `Cần thêm ${((v.min_order_vnd - subtotalPrice) / 1000).toLocaleString("vi-VN")}K nữa`;
                  } else if (candidateOrderDiscount <= currentOrderDiscount) {
                    isDisabled = true;
                    disabledReason = "Voucher không tạo thêm ưu đãi cho đơn này";
                  }
                }
                if (!isSelected && !isDisabled && v.voucher_type === "FREESHIP") {
                  if (orderType !== "DELIVERY" || (shippingFee ?? 0) <= 0) {
                    isDisabled = true;
                    disabledReason = "Chỉ áp dụng khi đơn giao hàng có phí ship";
                  } else if (
                    v.min_order_vnd !== null &&
                    amountBeforeShipping < v.min_order_vnd
                  ) {
                    isDisabled = true;
                    disabledReason = `Cần thêm ${((v.min_order_vnd - amountBeforeShipping) / 1000).toLocaleString("vi-VN")}K nữa`;
                  } else if ((v.covered_delivery_fee_vnd ?? 0) <= 0) {
                    isDisabled = true;
                    disabledReason = "Voucher không tạo thêm ưu đãi cho đơn này";
                  }
                }
                const productSelection = v.voucher_type === "PRODUCT_DISCOUNT"
                  ? getProductDiscountSelection(
                      productTargets(v),
                      cart.find((item) => item.lineVoucher && item.lineVoucher.token !== v.qr_token)?.lineVoucher?.token ?? null,
                    )
                  : null;
                if (!isSelected && !isDisabled && productSelection?.kind === "none") {
                  isDisabled = true;
                  disabledReason = productSelection.reason;
                }

                const handleSelection = () => {
                  if (!selectionContextIsCurrent()) return;
                  setActiveView({ kind: "list" });
                  switch (v.voucher_type) {
                    case "BUNDLE":
                      if (selectedBundle) onRequestRemoveBundle(v.qr_token);
                      else setActiveView({ kind: "bundle-setup", voucher: v });
                      return;
                    case "PRODUCT_DISCOUNT":
                      if (selectedProductItem) {
                        onRemoveProductVoucher(selectedProductItem.cartId);
                      } else if (productSelection?.kind === "single") {
                        onApplyProductVoucher(productSelection.target.cartId, v);
                      } else if (productSelection?.kind === "multiple") {
                        setActiveView({ kind: "product-target", voucher: v });
                      }
                      return;
                    case "DISCOUNT":
                    case "FREESHIP":
                      if (isDisabled) return;
                      onUpdateSelectedVouchers((previous: string[]) => {
                        if (isSelected) return previous.filter((id) => id !== v.qr_token);
                        let nextSelected = [...previous];
                        if (v.voucher_type === "DISCOUNT" && v.discount_type === "PERCENT") {
                          nextSelected = nextSelected.filter((id) => {
                            const existingVoucher = discountVouchers.find((candidate) => candidate.qr_token === id);
                            return !(existingVoucher && existingVoucher.discount_type === "PERCENT");
                          });
                        }
                        if (v.voucher_type === "FREESHIP") {
                          nextSelected = nextSelected.filter((id) =>
                            !freeshipVouchers.some((candidate) => candidate.qr_token === id));
                        }
                        return [...nextSelected, v.qr_token];
                      });
                      return;
                    case "PRODUCT":
                    case "ITEM":
                      if (selectedCartItem) {
                        onRemoveProductVoucher(selectedCartItem.cartId);
                        return;
                      }
                      if ((v.eligible_menu_items?.length ?? 0) > 1) {
                        setActiveView({ kind: "detail", voucher: v });
                        return;
                      }
                      onUseProductVoucher(v);
                      return;
                    case "ADDON":
                      if (selectedCartItem) {
                        onRemoveAddonVoucher(selectedCartItem.cartId, v.qr_token);
                        return;
                      }
                      setActiveView({ kind: "addon-target", voucher: v });
                      return;
                    default:
                      return;
                  }
                };

                return (
                  <VoucherCard 
                    key={v.qr_token}
                    voucher={v} 
                    isDisabled={isDisabled}
                    disabledReason={disabledReason}
                    isSelected={isSelected}
                    onClick={() => {
                      setActiveView({ kind: "detail", voucher: v });
                    }}
                    onAction={handleSelection}
                    actionModel={
                      (v.voucher_type === "PRODUCT" || v.voucher_type === "ITEM" || v.voucher_type === "ADDON") && !isSelected
                        ? buildVoucherActionModel({ context: "wallet", busy: false })
                        : buildVoucherActionModel({
                            context: "cart",
                            selected: isSelected,
                            selectable: isSelected || !isDisabled,
                            disabledReason: disabledReason || null,
                            estimatedBenefitVnd: productSelection?.kind === "single"
                              ? productSelection.target.estimatedBenefitVnd
                              : 0,
                          })
                    }
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
        open={targetVoucher !== null}
        onOpenChange={(open) => { if (!open) setActiveView({ kind: "list" }); }}
        layer="critical"
        title="Chọn món áp dụng"
      >
        <div className="space-y-2 p-4">
          {targetVoucher ? productTargets(targetVoucher).map((target) => {
            const item = cart.find((candidate) => candidate.cartId === target.cartId);
            return (
              <button
                key={target.cartId}
                type="button"
                onClick={() => {
                  onApplyProductVoucher(target.cartId, targetVoucher);
                  setActiveView({ kind: "list" });
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  <span className="block text-sm font-bold">{item?.name}</span>
                  <span className="block text-xs text-muted-foreground">Size <SizeLabel size={target.size} /></span>
                </span>
                <span className="text-sm font-bold text-primary">-{target.estimatedBenefitVnd.toLocaleString("vi-VN")}đ</span>
              </button>
            );
          }) : null}
        </div>
      </ResponsiveOverlay>
      <ResponsiveOverlay
        open={addonTargetVoucher !== null}
        onOpenChange={(open) => { if (!open) setActiveView({ kind: "list" }); }}
        layer="critical"
        title="Chọn món áp dụng"
      >
        {addonTargetVoucher ? (
          <AddonItemPicker
            voucher={addonTargetVoucher}
            cartItems={cart}
            bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
            menuData={menuData}
            canEdit={!isLoading}
            onBack={() => setActiveView({ kind: "list" })}
            onSuccess={() => setActiveView({ kind: "list" })}
            onApplyVoucher={onApplyAddonVoucher}
            onSavePendingVoucher={onSavePendingAddonVoucher}
            onPending={() => {
              setActiveView({ kind: "list" });
              onClose();
              if (!onSavePendingAddonVoucher) router.push("/menu");
            }}
          />
        ) : null}
      </ResponsiveOverlay>
      {bundleSetupVoucher ? (
        <BundleVoucherSetupSheet
          open
          layer="critical"
          voucher={bundleSetupVoucher}
          cartItems={cart}
          bundleApplications={bundleApplications}
          initialApplication={bundleApplications.find((application) => application.voucher_qr_token === bundleSetupVoucher.qr_token)}
          menuData={menuData}
          milkTypes={menuData.milk_types}
          powders={powders}
          defaultPowderGram={defaultPowderGram}
          onClose={() => setActiveView({ kind: "list" })}
          onValidateDraft={(candidate: BundleCartDraftResult): BundleCartDraftValidation => {
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
          onCommitDraft={onCommitBundleCartDraft}
          onSuccess={() => setActiveView({ kind: "list" })}
        />
      ) : null}
    </ResponsiveOverlay>
  );
};
