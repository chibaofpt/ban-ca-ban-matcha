import React, { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";
import { type MyVoucher, type VoucherPackage } from "@/src/services/customerVoucherService";
import { useVoucherAcquisition } from "@/src/hooks/useVoucherAcquisition";
import { VoucherCard } from "@/src/components/shared/VoucherCards";
import { VoucherHistorySection, VoucherModalFrame } from "@/src/components/shared/VoucherModalSections";
import { VoucherPackageCatalog } from "@/src/components/shared/VoucherPackageCatalog";
import { VoucherAcquisitionConfirm } from "@/src/components/shared/VoucherAcquisitionConfirm";
import { CartDiscountPickerFooter } from "@/src/components/menu/cart/CartDiscountPickerFooter";
import { toast } from "sonner";
import type { CartItem } from "@/src/lib/types/cart";
import type { BundleCreatedRewardEffect, CartBundleApplication } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import { VoucherDetailSheet } from "@/src/components/shared/VoucherDetailSheet";
import { buildVoucherActionModel, getProductDiscountSelection } from "@/src/utils/customerVoucherSelection";
import { getVoucherAvailabilityMessage, type VoucherModalTab } from "@/src/lib/utils/voucherModalHelpers";
import { BundleVoucherSetupSheet } from "@/src/components/shared/BundleVoucherSetupSheet";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { buildBundleApplication, deriveBundleSelectionState, summarizeBundleCart } from "@/src/lib/utils/bundleVoucher";

interface CartDiscountPickerProps {
  discountVouchers: MyVoucher[];
  freeshipVouchers: MyVoucher[];
  productDiscountVouchers: MyVoucher[];
  historyVouchers: MyVoucher[];
  availableVoucherPackages: VoucherPackage[];
  pointsBalance: number;
  selectedVoucherIds: string[];
  selectedDiscountVouchers: MyVoucher[];
  selectedFreeshipVouchers: MyVoucher[];
  subtotalPrice: number;
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
  onClose: () => void;
  onUpdateSelectedVouchers: React.Dispatch<React.SetStateAction<string[]>>;
  onRefreshVouchers: () => Promise<void>;
  bundleVouchers: MyVoucher[];
  cart: CartItem[];
  menuData: MenuData;
  powders: Powder[];
  defaultPowderGram: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; grams: number }>;
  getProductVoucherBenefit: (item: CartItem, voucher: MyVoucher) => number;
  onApplyProductVoucher: (cartId: string, voucher: MyVoucher) => void;
  onRemoveProductVoucher: (cartId: string) => void;
  bundleAllocatedCartIds: ReadonlySet<string>;
  addonLabels: ReadonlyMap<string, string>;
  bundleApplications: CartBundleApplication[];
  onBundleApplicationChange: (voucher: MyVoucher, allocations: import("@/src/lib/utils/bundleVoucher").BundleSelectionAllocation[], effects?: BundleCreatedRewardEffect[]) => { ok: true } | { ok: false; error: string };
  onRequestRemoveBundle: (voucherToken: string) => void;
  onAddExtrasReward: (menuItemId: string, voucherToken: string) => { clientLineId: string; effect: BundleCreatedRewardEffect } | null;
}

export const CartDiscountPicker = ({
  discountVouchers,
  freeshipVouchers,
  productDiscountVouchers,
  historyVouchers,
  availableVoucherPackages,
  pointsBalance,
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
  bundleAllocatedCartIds,
  addonLabels,
  bundleApplications,
  onBundleApplicationChange,
  onRequestRemoveBundle,
  onAddExtrasReward,
}: CartDiscountPickerProps) => {
  const { acquire, isPending } = useVoucherAcquisition();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmPackage, setConfirmPackage] = useState<VoucherPackage | null>(null);
  const [detailVoucher, setDetailVoucher] = useState<MyVoucher | null>(null);
  const [targetVoucher, setTargetVoucher] = useState<MyVoucher | null>(null);
  const [bundleSetupVoucher, setBundleSetupVoucher] = useState<MyVoucher | null>(null);
  const [activeTab, setActiveTab] = useState<VoucherModalTab>("my_vouchers");

  const myVouchers = [...discountVouchers, ...freeshipVouchers, ...productDiscountVouchers, ...bundleVouchers]
    .filter((voucher) => voucher.status === "ACTIVE");

  const productTargets = (voucher: MyVoucher) => cart.flatMap((item) => {
    const matchesProduct = (voucher.eligible_menu_items?.length ?? 0) > 0
      ? voucher.eligible_menu_items!.some((target) => target.menu_item_id === item.menuItemId)
      : voucher.menu_item_id === item.menuItemId;
    const benefit = getProductVoucherBenefit(item, voucher);
    return matchesProduct && item.size !== null && (voucher.eligible_sizes ?? []).includes(item.size) &&
      !bundleAllocatedCartIds.has(item.cartId) && benefit > 0
      ? [{ cartId: item.cartId, menuItemId: item.menuItemId, size: item.size, estimatedBenefitVnd: benefit }]
      : [];
  });

  const acquirePackage = async (pkg: VoucherPackage) => {
    try {
      setRedeemingId(pkg.id);
      const newVoucher = await acquire(pkg);
      await onRefreshVouchers();
      if (newVoucher.voucher_type === "BUNDLE") {
        requestAnimationFrame(() => {
          const panel = document.getElementById("cart-bundle-voucher-panel");
          panel?.scrollIntoView({ behavior: "smooth", block: "start" });
          panel?.focus();
        });
      } else {
        onUpdateSelectedVouchers((previous) => [...previous, newVoucher.qr_token]);
      }
      toast.success(pkg.acquisition_mode === "FREE_CLAIM" ? "Đã nhận voucher" : "Đổi voucher thành công");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
      toast.error(`Không thể nhận ưu đãi: ${message}`);
    } finally {
      setRedeemingId(null);
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

  return (
    <ResponsiveOverlay
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      layer="nested"
      title="Mã ưu đãi"
      presentation="bare"
      className="w-full md:max-w-2xl"
    >
      <VoucherModalFrame
        activeTab={activeTab}
        isLoggedIn
        voucherCount={myVouchers.length}
        pointsBalance={pointsBalance}
        onChange={setActiveTab}
        onClose={onClose}
        headerAction={activeTab === "my_vouchers" && selectedVoucherIds.length > 0 ? (
          <button
            type="button"
            onClick={() => onUpdateSelectedVouchers([])}
            className="min-h-11 shrink-0 rounded-full bg-red-50 px-3 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Bỏ tất cả
          </button>
        ) : null}
        footer={activeTab === "my_vouchers" ? (
          <CartDiscountPickerFooter selectedVoucherIds={selectedVoucherIds} selectedDiscountVouchers={selectedDiscountVouchers} subtotalPrice={subtotalPrice} freeshipDiscount={selectedFreeshipDiscount} onConfirm={onClose} />
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
            <AnimatePresence>
              {detailVoucher ? (
                <VoucherDetailSheet
                  key="cart-voucher-detail"
                  voucher={detailVoucher}
                  cartItems={cart}
                  subtotalVnd={subtotalPrice}
                  myVouchers={[...myVouchers, ...historyVouchers]}
                  orderType={orderType}
                  shippingFee={shippingFee}
                  menuData={menuData}
                  onBack={() => setDetailVoucher(null)}
                  onUseNowSuccess={() => setDetailVoucher(null)}
                  onOpenBundleSetup={() => {
                    setDetailVoucher(null);
                    setBundleSetupVoucher(detailVoucher);
                  }}
                  onRequestRefund={() => undefined}
                  isRefunding={false}
                  onSelectProductDiscountTarget={(voucher) => {
                    const selection = getProductDiscountSelection(productTargets(voucher), null);
                    if (selection.kind === "single") {
                      onApplyProductVoucher(selection.target.cartId, voucher);
                      setDetailVoucher(null);
                    } else if (selection.kind === "multiple") {
                      setDetailVoucher(null);
                      setTargetVoucher(voucher);
                    }
                  }}
                />
              ) : null}
            </AnimatePresence>
          </>
        )}
      >
        {activeTab === "my_vouchers" && <section>
          {myVouchers.length === 0 ? (
            <div className="text-center py-6 bg-white rounded-2xl border border-dashed border-border/60">
              <p className="text-xs text-primary/40 font-medium">Bạn chưa có mã ưu đãi nào</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {myVouchers.map((v) => {
                const selectedProductItem = v.voucher_type === "PRODUCT_DISCOUNT"
                  ? cart.find((item) => item.productVoucherId === v.qr_token)
                  : undefined;
                const selectedBundle = v.voucher_type === "BUNDLE"
                  ? bundleApplications.some((application) => application.voucher_qr_token === v.qr_token)
                  : false;
                const isSelected = selectedVoucherIds.includes(v.qr_token) || Boolean(selectedProductItem) || selectedBundle;
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
                    disabledReason = "Chưa đạt giá trị đơn tối thiểu";
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
                    disabledReason = "Chưa đạt giá trị đơn tối thiểu sau giảm giá";
                  } else if ((v.covered_delivery_fee_vnd ?? 0) <= 0) {
                    isDisabled = true;
                    disabledReason = "Voucher không tạo thêm ưu đãi cho đơn này";
                  }
                }
                const productSelection = v.voucher_type === "PRODUCT_DISCOUNT"
                  ? getProductDiscountSelection(
                      productTargets(v),
                      cart.find((item) => item.productVoucherId && item.productVoucherId !== v.qr_token)?.productVoucherId ?? null,
                    )
                  : null;
                if (!isSelected && !isDisabled && productSelection?.kind === "none") {
                  isDisabled = true;
                  disabledReason = productSelection.reason;
                }

                const handleSelection = () => {
                  if (v.voucher_type === "BUNDLE") {
                    if (selectedBundle) onRequestRemoveBundle(v.qr_token);
                    else setBundleSetupVoucher(v);
                    return;
                  }
                  if (selectedProductItem) {
                    onRemoveProductVoucher(selectedProductItem.cartId);
                    return;
                  }
                  if (productSelection?.kind === "single") {
                    onApplyProductVoucher(productSelection.target.cartId, v);
                    return;
                  }
                  if (productSelection?.kind === "multiple") {
                    setTargetVoucher(v);
                    return;
                  }
                  if (isDisabled) return;
                  onUpdateSelectedVouchers((prev: string[]) => {
                    if (isSelected) return prev.filter((id) => id !== v.qr_token);
                    let newSelected = [...prev];
                    if (v.voucher_type === "DISCOUNT" && v.discount_type === "PERCENT") {
                      newSelected = newSelected.filter(id => {
                        const existingV = discountVouchers.find(d => d.qr_token === id);
                        return !(existingV && existingV.discount_type === "PERCENT");
                      });
                    }
                    if (v.voucher_type === "FREESHIP") {
                      newSelected = newSelected.filter(id => !freeshipVouchers.find(f => f.qr_token === id));
                    }
                    return [...newSelected, v.qr_token];
                  });
                };

                return (
                  <VoucherCard 
                    key={v.qr_token}
                    voucher={v} 
                    isDisabled={isDisabled}
                    disabledReason={disabledReason}
                    isSelected={isSelected}
                    onClick={() => setDetailVoucher(v)}
                    onAction={handleSelection}
                    actionModel={buildVoucherActionModel({
                      context: "cart",
                      selected: isSelected,
                      selectable: isSelected || !isDisabled,
                      disabledReason: disabledReason || null,
                      estimatedBenefitVnd: productSelection?.kind === "single"
                        ? productSelection.target.estimatedBenefitVnd
                        : 0,
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
            pointsBalance={pointsBalance}
            pendingPackageId={isPending ? redeemingId : null}
            onAcquire={handleAcquire}
            columns="one"
          />
        )}

        {activeTab === "history" && (
          <VoucherHistorySection vouchers={historyVouchers} onVoucherClick={setDetailVoucher} />
        )}
      </VoucherModalFrame>
      <ResponsiveOverlay
        open={targetVoucher !== null}
        onOpenChange={(open) => { if (!open) setTargetVoucher(null); }}
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
                  setTargetVoucher(null);
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  <span className="block text-sm font-bold">{item?.name}</span>
                  <span className="block text-xs text-muted-foreground">Size {target.size}</span>
                </span>
                <span className="text-sm font-bold text-primary">-{target.estimatedBenefitVnd.toLocaleString("vi-VN")}đ</span>
              </button>
            );
          }) : null}
        </div>
      </ResponsiveOverlay>
      {bundleSetupVoucher ? (
        <BundleVoucherSetupSheet
          open
          layer="critical"
          voucher={bundleSetupVoucher}
          menuData={menuData}
          milkTypes={menuData.milk_types}
          powders={powders}
          defaultPowderGram={defaultPowderGram}
          onClose={() => setBundleSetupVoucher(null)}
          onValidateDraft={({ cartItems, rewardAllocations }) => {
            const summary = getBundleVoucherSummary(bundleSetupVoucher);
            if (!summary) return { ok: false, error: "Voucher BUNDLE không còn khả dụng" };
            const draftCart = summarizeBundleCart(cartItems);
            const selection = deriveBundleSelectionState({ voucher: summary, cart: draftCart, allocations: rewardAllocations });
            const payload = buildBundleApplication({ voucher: summary, cart: draftCart, rewardAllocations });
            return selection.status === "READY" && payload
              ? { ok: true }
              : { ok: false, error: selection.message };
          }}
          onSuccess={(_token, allocations, createdRewardEffects) => {
            const result = onBundleApplicationChange(bundleSetupVoucher, allocations, createdRewardEffects);
            if (result.ok) setBundleSetupVoucher(null);
            return result;
          }}
        />
      ) : null}
    </ResponsiveOverlay>
  );
};
