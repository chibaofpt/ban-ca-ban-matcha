"use client";

import React, { useState, useMemo, useCallback } from "react";
import { User, UserX, Ticket, ArrowLeft, CheckCircle2, ChevronRight, X } from "lucide-react";
import type { BundleCreatedRewardEffect, BundleCartDraftCommit, CartBundleApplication, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuData, Size, SweetnessLevel } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { CustomerInfo } from "./CustomerSelectModal";
import type { MyVoucher } from "@/src/services/staffVoucherService";
import { cn } from "@/src/utils/cn";
import { formatVietnamPhone } from "@/src/utils/display";
import {
  buildProductVoucherMap,
  buildAddonVoucherMap,
  filterUsableVouchers,
  getAddonVoucherTargetChoices,
} from "@/src/utils/voucherMatchUtils";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import StaffCartItemCard from "./cart/StaffCartItemCard";
import { VoucherCard, PackageCard } from "@/src/components/shared/VoucherCards";
import type { VoucherPackage } from "@/src/services/customerVoucherService";
import type { BundleCartDraftResult, BundleCartDraftValidation } from "@/src/lib/utils/bundleCartDraft";
import type { DiscountVoucher } from "@/src/lib/store/staffCartStore";
import Image from "next/image";
import type { PaymentMethod } from "@/src/lib/types/order";
import { PaymentMethodSelector } from "@/src/components/staff/PaymentMethodSelector";
import { CartBundleVoucherPanel, getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import { deriveBundleAllocationConstraints, summarizeBundleCart, type BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { projectCartTotals, type VoucherProjectionSource } from "@/src/lib/utils/bundleVoucherProjection";
import { BundleVoucherSetupSheet } from "@/src/components/shared/BundleVoucherSetupSheet";
import type { VoucherAcquisitionReceipt } from "@/src/lib/utils/voucherAcquisitionState";
import { getBundleAllocatedQuantities, getBundleOutsideAddonQuantity, getBundleOutsideQuantity } from "@/src/lib/utils/bundleCartSummary";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";

// ── Constants ────────────────────────────────────────────────────────────────

const SWEETNESS_LABEL: Record<SweetnessLevel, string> = {
  NONE: "Lạt",
  QUARTER: "Ít ngọt",
  HALF: "Vừa",
  THREE_QUARTER: "Ngọt",
  FULL: "Rất ngọt",
  EXTRA: "Cực ngọt",
};
void SWEETNESS_LABEL;

// ── Props ────────────────────────────────────────────────────────────────────

interface StaffCartDrawerProps {
  menuData?: MenuData;
  powderData?: PowderApiResponse;
  isOpen: boolean;
  cart: ProjectedCartLine[];
  discountVoucher: DiscountVoucher | null;
  customerInfo: CustomerInfo | null;
  isSubmitting?: boolean;
  paymentMethod?: PaymentMethod;
  onClose: () => void;
  onRemove: (cartId: string) => void;
  onEditItem?: (item: ProjectedCartLine, allowedSizes?: Size[]) => void;
  onChangeQuantity: (cartId: string, newQty: number) => void;
  onCheckout: () => void;
  onPaymentMethodChange?: (method: PaymentMethod) => void;
  onOpenCustomerSelect: () => void;
  onClearCustomer: () => void;
  bundleApplications: CartBundleApplication[];
  onBundleApplicationChange: (voucher: MyVoucher, allocations: BundleSelectionAllocation[], effect?: BundleCreatedRewardEffect) => void;
  onRequestRemoveBundle: (voucherToken: string) => CartMutationResult;
  onOpenBundleSetup?: (voucher: MyVoucher) => void;
  onRepairBundle?: (voucher: MyVoucher) => void;
  bundleSetupVoucher?: MyVoucher | null;
  bundleSetupApplication?: CartBundleApplication;
  onCloseBundleSetup?: () => void;
  onValidateBundleDraft?: (candidate: BundleCartDraftResult) => BundleCartDraftValidation;
  onCommitBundleDraft?: (draft: BundleCartDraftCommit) => CartMutationResult;
  onBundleSetupSuccess?: () => void;

  customerVouchers?: MyVoucher[];
  selectedDiscountIds?: string[];
  onToggleDiscount?: (voucherId: string) => void;
  onApplyProduct?: (cartId: string, voucher: MyVoucher) => CartMutationResult;
  onRemoveProduct?: (cartId: string) => CartMutationResult;
  onApplyAddon?: (cartId: string, voucher: MyVoucher, addonOptionId: string) => CartMutationResult;
  onRemoveAddon?: (cartId: string, voucherId: string) => CartMutationResult;
  productModalNode?: React.ReactNode;
  onClearCart?: () => void;
  availableVoucherPackages?: VoucherPackage[];
  onExchangeVoucher?: (packageId: string) => void;
  isExchanging?: boolean;
  acquisitionReceipt?: VoucherAcquisitionReceipt | null;
  onRetryVoucherRefresh?: () => void;
  preventCloseOutside?: boolean;
  checkoutBlocked?: boolean;
  voucherRevalidating?: boolean;
  persistenceWarning?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StaffCartDrawer({
  menuData,
  powderData,
  isOpen,
  cart,
  discountVoucher,
  customerInfo,
  isSubmitting = false,
  paymentMethod = "CASH",
  onClose,
  onRemove,
  onEditItem,
  onChangeQuantity,
  onCheckout,
  onPaymentMethodChange = () => undefined,
  onOpenCustomerSelect,
  onClearCustomer,
  bundleApplications,
  onBundleApplicationChange,
  onRequestRemoveBundle,
  onOpenBundleSetup,
  onRepairBundle,
  bundleSetupVoucher,
  bundleSetupApplication,
  onCloseBundleSetup,
  onValidateBundleDraft,
  onCommitBundleDraft,
  onBundleSetupSuccess,
  customerVouchers = [],
  selectedDiscountIds = [],
  onToggleDiscount,
  onApplyProduct,
  onRemoveProduct,
  onApplyAddon,
  onRemoveAddon,
  productModalNode,
  onClearCart,
  availableVoucherPackages = [],
  onExchangeVoucher,
  isExchanging = false,
  acquisitionReceipt,
  onRetryVoucherRefresh,
  preventCloseOutside = false,
  checkoutBlocked = false,
  voucherRevalidating = false,
  persistenceWarning = null,
}: StaffCartDrawerProps) {
  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])] : [];

  const [activeItemForVoucher, setActiveItemForVoucher] = useState<string | null>(null);
  const [isDiscountPickerOpen, setIsDiscountPickerOpen] = useState(false);
  const [bundleTokenToRemove, setBundleTokenToRemove] = useState<string | null>(null);
  const [addonChoiceVoucherId, setAddonChoiceVoucherId] = useState<string | null>(null);
  const closeVoucherPickerAfter = (result: CartMutationResult) => {
    if (!result.ok) {
      void import("sonner").then(({ toast }) => toast.error(result.message));
      return;
    }
    setActiveItemForVoucher(null);
  };

  // Pull-to-dismiss logic is handled by DismissableSheet.
  // Body scroll lock is handled by DismissableSheet.


  // Vouchers
  const discountVouchers = useMemo(() => filterUsableVouchers(customerVouchers, "DISCOUNT"), [customerVouchers]);
  const applicableProductVouchers = useMemo(() => buildProductVoucherMap(customerVouchers, cart), [customerVouchers, cart]);
  const applicableAddonVouchersMap = useMemo(() => buildAddonVoucherMap(customerVouchers, cart), [customerVouchers, cart]);
  const bundleVouchers = useMemo(
    () => customerVouchers.filter((voucher) => voucher.voucher_type === "BUNDLE"),
    [customerVouchers],
  );
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
  const addonLabels = useMemo(
    () =>
      new Map(
        (menuData?.addon_groups ?? []).flatMap((group) =>
          group.options.map((option) => [option.id, option.label] as const),
        ),
      ),
    [menuData?.addon_groups],
  );
  const bundleConstraints = useMemo(() => deriveBundleAllocationConstraints({
    cart: summarizeBundleCart(cart),
    applications: bundleApplications.flatMap((application) => {
      const voucher = customerVouchers.find((candidate) => candidate.qr_token === application.voucher_qr_token);
      const summary = voucher ? getBundleVoucherSummary(voucher) : null;
      return summary ? [{
        voucher_qr_token: application.voucher_qr_token,
        voucher: summary,
        qualifier_allocations: application.qualifier_allocations,
        reward_allocations: application.reward_allocations,
      }] : [];
    }),
  }), [bundleApplications, cart, customerVouchers]);
  const bundleAllocationBadgesByLine = useMemo(() => {
    const grouped = new Map<string, Map<string, { token: string; label: string; quantity: number }>>();
    for (const application of bundleApplications) {
      const voucher = customerVouchers.find((candidate) => candidate.qr_token === application.voucher_qr_token);
      if (!voucher) continue;
      for (const allocation of [...application.qualifier_allocations, ...application.reward_allocations]) {
        const badges = grouped.get(allocation.client_line_id) ?? new Map<string, { token: string; label: string; quantity: number }>();
        const current = badges.get(application.voucher_qr_token);
        badges.set(application.voucher_qr_token, {
          token: application.voucher_qr_token,
          label: voucher.package.name,
          quantity: (current?.quantity ?? 0) + allocation.quantity,
        });
        grouped.set(allocation.client_line_id, badges);
      }
    }
    return new Map([...grouped.entries()].map(([lineId, badges]) => [lineId, [...badges.values()]]));
  }, [bundleApplications, customerVouchers]);

  // Discounts
  const scannedDiscountForProjection = useMemo<VoucherProjectionSource | null>(() => {
    if (!discountVoucher || customerVouchers.some((voucher) => voucher.qr_token === discountVoucher.qr_token)) return null;
    return {
      qr_token: discountVoucher.qr_token,
      voucher_type: "DISCOUNT",
      discount_type: discountVoucher.discount_type,
      discount_value: discountVoucher.discount_value,
      max_discount_vnd: null,
      covered_price_vnd: null,
      covered_delivery_fee_vnd: null,
      min_order_vnd: null,
      status: "ACTIVE",
      package: { name: "Voucher quét mã", description: null, points_cost: 0, bundleRule: null },
    };
  }, [customerVouchers, discountVoucher]);
  const projectionVoucherIds = useMemo(
    () => Array.from(new Set([
      ...selectedDiscountIds,
      ...(discountVoucher ? [discountVoucher.qr_token] : []),
    ])),
    [discountVoucher, selectedDiscountIds],
  );
  const cartProjection = useMemo(() => projectCartTotals({
    items: cart,
    applications: bundleApplications,
    vouchers: scannedDiscountForProjection ? [...customerVouchers, scannedDiscountForProjection] : customerVouchers,
    selectedVoucherIds: projectionVoucherIds,
    shipping_fee_vnd: 0,
  }), [bundleApplications, cart, customerVouchers, projectionVoucherIds, scannedDiscountForProjection]);
  const subtotalVnd = cartProjection.totals.subtotal_vnd;
  const totalDiscountVnd = cartProjection.totals.items_discount_vnd + cartProjection.totals.total_voucher_discount_vnd;
  const totalVnd = cartProjection.totals.total_vnd;
  const hasVoucherSelection = selectedDiscountIds.length > 0 || bundleApplications.length > 0 || cart.some((item) =>
    Boolean(item.lineVoucher) || item.addonVouchers.length > 0,
  );

  const activeItem = cart.find(i => i.cartId === activeItemForVoucher);
  const addonChoicesFor = useCallback((voucher: MyVoucher, item: ProjectedCartLine) => {
    const applied = item.addonVouchers.find((entry) => entry.token === voucher.qr_token);
    const excluded = (item.addonVouchers ?? [])
      .filter((entry) => entry.token !== voucher.qr_token)
      .map((entry) => entry.addonOptionId);
    return getAddonVoucherTargetChoices(
      voucher,
      applied ? [applied.addonOptionId] : item.configuration.size === null ? [] : item.configuration.addonOptionIds,
      excluded,
      Object.fromEntries(item.resolvedAddons.map((addon) => [addon.id, addon.priceVnd])),
    ).filter((choice) => getBundleOutsideAddonQuantity(
      `${item.cartId}:${choice.addonOptionId}`,
      item.quantity,
      bundleAllocatedAddonQuantities,
    ) > 0);
  }, [bundleAllocatedAddonQuantities]);
  const activeProductVouchers = activeItem &&
    getBundleOutsideQuantity(activeItem, bundleAllocatedQuantitiesByCartId) > 0
    ? applicableProductVouchers.get(activeItem.menuItemId) ?? []
    : [];
  const activeAddonVouchers = activeItem
    ? (applicableAddonVouchersMap.get(activeItem.cartId) ?? []).filter((voucher) => {
        return addonChoicesFor(voucher, activeItem).length > 0;
      })
    : [];

  const handleClose = useCallback(() => {
    onClose();
    // Reset sub-overlay state after close animation
    setTimeout(() => {
      setActiveItemForVoucher(null);
      setIsDiscountPickerOpen(false);
      setAddonChoiceVoucherId(null);
    }, 300);
  }, [onClose, setActiveItemForVoucher, setIsDiscountPickerOpen]);

  return (
    <Drawer.Root 
      open={isOpen} 
      dismissible={!preventCloseOutside}
      repositionInputs={false}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content 
          data-testid="staff-cart-sheet"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            // Prevent closing if the clicked element was removed from the DOM (e.g. clicking a button inside a modal that unmounts)
            if (target && !document.contains(target)) {
              e.preventDefault();
              return;
            }

            if (
              preventCloseOutside ||
              document.querySelector('[data-confirm-modal="true"]') ||
              document.querySelector('[data-prevent-drawer-close="true"]')
            ) {
              e.preventDefault();
            }
          }}
          className="fixed bottom-0 left-0 right-0 z-50 flex h-auto max-h-[100dvh] flex-col rounded-t-3xl bg-card shadow-2xl outline-none after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit after:content-['']"
        >
          <div className="flex justify-center pt-3 pb-1 w-full shrink-0">
            <div className="w-12 h-1.5 bg-border rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 pt-2 pb-3 shrink-0 border-b border-border/40">
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                Giỏ hàng <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{cart.reduce((sum, c) => sum + c.quantity, 0)}</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Đóng giỏ hàng"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/50 transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} />
            </button>
          </div>
          {persistenceWarning ? (
            <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" role="status">
              {persistenceWarning}
            </div>
          ) : null}
        <>
        <div className="px-4 py-3 shrink-0 border-b border-border/30">
          <div className="bg-secondary/20 rounded-2xl p-3 border border-border flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {customerInfo ? <User size={18} className="text-primary" /> : <UserX size={18} className="text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight truncate">
                  {customerInfo ? customerInfo.type === "existing" ? customerInfo.data.name : customerInfo.name : "Khách vãng lai"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {customerInfo
                    ? (customerInfo.type === "existing" ? `${formatVietnamPhone(customerInfo.data.phone_number)} • 🐟 ${customerInfo.data.points_balance}` : formatVietnamPhone(customerInfo.phone_number))
                    : "Không tích điểm"}
                </p>
              </div>
            </div>

            {customerInfo ? (
              <button
                onClick={onClearCustomer}
                className="text-xs font-semibold text-destructive hover:bg-destructive/10 transition px-3 py-1.5 rounded-full shrink-0"
              >
                Huỷ
              </button>
            ) : (
              <button
                onClick={onOpenCustomerSelect}
                className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-4 py-2 rounded-full transition shrink-0"
              >
                Tìm / Thêm
              </button>
            )}
          </div>
        </div>

        {/* Item list */}
        <div
          data-testid="staff-cart-items"
          className="min-h-0 flex-[0_1_auto] space-y-4 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-4"
        >
          {cart.length === 0 ? (
             <div className="text-center py-10 text-muted-foreground space-y-3">
               <span className="text-5xl block">🛒</span>
               <p className="font-medium text-sm">Giỏ hàng đang trống</p>
             </div>
          ) : (
            [...cart].reverse().map((c) => {
              const productVouchersForItem = getBundleOutsideQuantity(c, bundleAllocatedQuantitiesByCartId) > 0
                ? applicableProductVouchers.get(c.menuItemId) || []
                : [];
              const addonVouchersForItem = (applicableAddonVouchersMap.get(c.cartId) || []).filter((voucher) => {
                return addonChoicesFor(voucher, c).length > 0;
              });
              const menuItem = menuItems.find(m => m.id === c.menuItemId);

              return (
                <StaffCartItemCard
                  key={c.cartId}
                  item={c}
                  menuItem={menuItem}
                  powderData={powderData}
                  milkTypes={menuData?.milk_types ?? []}
                  customerVouchers={customerVouchers}
                  applicableProductVouchers={productVouchersForItem}
                  applicableAddonVouchers={addonVouchersForItem}
                  onEdit={(item) => {
                    if (bundleConstraints.non_editable_line_ids.has(item.cartId)) return;
                    onEditItem?.(item, bundleConstraints.allowed_sizes_by_line.get(item.cartId));
                  }}
                  bundleAllocationBadges={bundleAllocationBadgesByLine.get(c.cartId)}
                  onRemove={onRemove}
                  onChangeQuantity={onChangeQuantity}
                  onRemoveProduct={onRemoveProduct}
                  onRemoveAddon={onRemoveAddon}
                  onOpenVoucherPicker={(cartId) => {
                    setActiveItemForVoucher(cartId);
                    setIsDiscountPickerOpen(false);
                  }}
                />
              );
            })
          )}
          {cart.length > 0 && customerInfo?.type === "existing" ? (
            <CartBundleVoucherPanel
              vouchers={bundleVouchers}
              cart={cart}
              addonLabels={addonLabels}
              bundleApplications={bundleApplications}
              onBundleApplicationChange={onBundleApplicationChange}
              onRequestRemoveBundle={setBundleTokenToRemove}
              onOpenBundleSetup={onOpenBundleSetup}
              onRepairBundle={onRepairBundle}
            />
          ) : null}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="px-5 pt-4 pb-6 border-t border-border/50 bg-background/50 backdrop-blur-md shrink-0 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.1)]">
            <div className="mb-4">
              <PaymentMethodSelector
                value={paymentMethod}
                bankTransferDisabled={totalVnd <= 0}
                onChange={onPaymentMethodChange}
              />
            </div>
            <div className="flex gap-4">
              {/* Left Column - Vouchers & Points */}
              <div className="flex-1 space-y-3">
                {customerInfo && discountVouchers.length > 0 && !!onToggleDiscount && (
                  <button
                    onClick={() => setIsDiscountPickerOpen(true)}
                    className="w-full flex items-center justify-between bg-orange-50 border border-orange-100 hover:bg-orange-100/80 transition-colors rounded-xl px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="bg-orange-100 p-1.5 rounded-lg text-orange-600 shrink-0">
                        <Ticket size={14} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-orange-800 leading-tight">Mã giảm đơn</p>
                        <p className="text-[10px] text-orange-600/80 leading-tight">
                          {selectedDiscountIds.length > 0 ? `${selectedDiscountIds.length} mã đang áp` : "Chọn mã"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-orange-400" />
                  </button>
                )}
                
                {/* Legacy discount from scanner */}
                {discountVoucher && !selectedDiscountIds.includes(discountVoucher.qr_token) && (
                  <div className="flex items-center justify-between bg-green-50/50 border border-green-200/50 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-green-700">🏷 Voucher quét mã</span>
                    <span className="text-xs font-bold text-green-700">Đã tính trong tổng</span>
                  </div>
                )}
              </div>

              {/* Right Column - Totals */}
              <div className="w-[45%] flex flex-col justify-end gap-1 text-right">
                {voucherRevalidating && hasVoucherSelection ? (
                  <p className="text-xs font-semibold text-amber-700">Đang xác minh ưu đãi đã chọn…</p>
                ) : null}
                <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                  <span>Tạm tính</span>
                  <span>{subtotalVnd.toLocaleString("vi-VN")}đ</span>
                </div>
                {totalDiscountVnd > 0 && (
                  <div className="flex justify-between items-center text-xs text-orange-600 font-bold">
                    <span>Giảm</span>
                    <span>-{totalDiscountVnd.toLocaleString("vi-VN")}đ</span>
                  </div>
                )}
                <div className="border-t border-dashed border-border/60 my-1" />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Tổng</span>
                  <span className="font-serif text-2xl font-bold text-primary leading-none flex items-center gap-1">
                    {totalVnd.toLocaleString("vi-VN")}đ
                  </span>
                  {customerInfo && totalVnd >= 10_000 && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md mt-1.5">
                      +{Math.floor(totalVnd / 10_000)} điểm cá
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              {onClearCart && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={onClearCart}
                  className="w-[30%] bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-2xl h-12 font-bold text-sm shadow-sm transition flex items-center justify-center shrink-0"
                >
                  Xoá tất cả
                </motion.button>
              )}
              
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={onCheckout}
                disabled={isSubmitting || checkoutBlocked}
                className={cn(
                  "bg-primary text-primary-foreground rounded-2xl h-12 font-bold text-sm shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none shrink-0",
                  onClearCart ? "w-[70%]" : "w-full"
                )}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  "Chốt đơn"
                )}
              </motion.button>
            </div>
          </div>
        )}

        {/* ── Overlay: Item Voucher Picker ─────────────────────────────── */}
        <AnimatePresence>
          {activeItemForVoucher && activeItem && !!onApplyProduct && !!onRemoveProduct && !!onApplyAddon && !!onRemoveAddon && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute inset-0 z-10 bg-background flex flex-col"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 shrink-0 bg-card">
                <button
                  onClick={() => setActiveItemForVoucher(null)}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                >
                  <ArrowLeft size={16} className="text-primary" />
                </button>
                <h3 className="font-bold text-primary">Ưu đãi cho món</h3>
              </div>

              <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-4 space-y-6">
                {/* Item context */}
                <div className="flex items-center gap-3 p-3 bg-secondary/20 border border-border/50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-secondary/40">
                     {activeItem.imageUrl ? <Image src={activeItem.imageUrl} alt={activeItem.name} width={48} height={48} sizes="48px" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xl">🍵</div>}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{activeItem.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {activeItem.category === "extras" ? "Add-on" : `Size ${activeItem.configuration.size}`}
                    </p>
                  </div>
                </div>

                {/* PRODUCT Vouchers */}
                {activeProductVouchers.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Miễn phí món</p>
                    <div className="space-y-2">
                      {activeProductVouchers.map(v => {
                        const isSelected = activeItem.lineVoucher?.token === v.qr_token;
                        const isAlreadyUsed = cart.some(c => c.cartId !== activeItem.cartId && c.lineVoucher?.token === v.qr_token);
                        
                        return (
                          <VoucherCard 
                            key={v.qr_token}
                            voucher={v}
                            isDisabled={isAlreadyUsed}
                            disabledReason={isAlreadyUsed ? "Đã dùng ở món khác" : undefined}
                            onClick={() => {
                              if (isAlreadyUsed) return;
                              if (isSelected && onRemoveProduct) closeVoucherPickerAfter(onRemoveProduct(activeItem.cartId));
                              else if (!isSelected && onApplyProduct) closeVoucherPickerAfter(onApplyProduct(activeItem.cartId, v));
                            }}
                            actionNode={
                              isSelected ? (
                                <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0 ml-2" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border border-border/60 shrink-0 ml-2" />
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ADDON Vouchers */}
                {activeAddonVouchers.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Topping miễn phí</p>
                    <div className="space-y-2">
                      {activeAddonVouchers.map(v => {
                        const isSelected = activeItem.addonVouchers.some(av => av.token === v.qr_token);
                        const isAlreadyUsed = cart.some(c => c.cartId !== activeItem.cartId && c.addonVouchers.some(av => av.token === v.qr_token));
                        const choices = addonChoicesFor(v, activeItem);
                        
                        return (
                          <div key={v.qr_token} className="space-y-2">
                          <VoucherCard 
                            voucher={v}
                            isDisabled={isAlreadyUsed}
                            disabledReason={isAlreadyUsed ? "Đã dùng ở ly khác" : undefined}
                            onClick={() => {
                              if (isAlreadyUsed) return;
                              if (isSelected && onRemoveAddon) {
                                closeVoucherPickerAfter(onRemoveAddon(activeItem.cartId, v.qr_token));
                              } else if (!isSelected && onApplyAddon && choices.length === 1) {
                                closeVoucherPickerAfter(onApplyAddon(activeItem.cartId, v, choices[0].addonOptionId));
                              } else if (!isSelected && choices.length > 1) {
                                setAddonChoiceVoucherId(v.qr_token);
                              }
                            }}
                            actionNode={
                              isSelected ? (
                                <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0 ml-2" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border border-border/60 shrink-0 ml-2" />
                              )
                            }
                          />
                          {!isSelected && addonChoiceVoucherId === v.qr_token ? (
                            <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/60 p-2" role="group" aria-label="Chọn topping được giảm">
                              {choices.map((choice) => (
                                <button
                                  type="button"
                                  key={choice.addonOptionId}
                                  onClick={() => {
                                    if (!onApplyAddon) return;
                                    const result = onApplyAddon(activeItem.cartId, v, choice.addonOptionId);
                                    if (result.ok) setAddonChoiceVoucherId(null);
                                    closeVoucherPickerAfter(result);
                                  }}
                                  className="flex min-h-11 w-full items-center justify-between rounded-lg bg-white px-3 text-left text-sm font-semibold"
                                >
                                  <span>{choice.label}</span>
                                  <span className="text-green-700">Giảm {choice.discountVnd.toLocaleString("vi-VN")}đ</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Overlay: Discount Voucher Picker ─────────────────────────────── */}
        <AnimatePresence>
          {isDiscountPickerOpen && !!onToggleDiscount && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute inset-0 z-20 bg-background flex flex-col"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 shrink-0 bg-card">
                <button
                  onClick={() => setIsDiscountPickerOpen(false)}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                >
                  <ArrowLeft size={16} className="text-primary" />
                </button>
                <h3 className="font-bold text-primary">Mã giảm giá đơn hàng</h3>
              </div>

              <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-4 space-y-3">
                {discountVouchers.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground mt-10">Không có mã giảm giá nào</p>
                )}
                {discountVouchers.map(v => {
                  const isSelected = selectedDiscountIds?.includes(v.qr_token) ?? false;
                  const hasPercent = (discountVoucher?.discount_type === "PERCENT") || (selectedDiscountIds?.some(id => {
                    const found = discountVouchers.find(dv => dv.qr_token === id);
                    return found?.discount_type === "PERCENT";
                  }) ?? false);
                  // Disable if trying to add a second PERCENT voucher
                  const isDisabled = !isSelected && v.discount_type === "PERCENT" && hasPercent;

                  return (
                    <VoucherCard 
                      key={v.qr_token}
                      voucher={v}
                      isDisabled={isDisabled}
                      disabledReason={isDisabled ? "Đã chọn 1 mã giảm %" : undefined}
                      onClick={() => !isDisabled && onToggleDiscount && onToggleDiscount(v.qr_token)}
                      actionNode={
                        isSelected ? (
                          <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0 ml-2" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-border/60 shrink-0 ml-2" />
                        )
                      }
                    />
                  );
                })}

                {/* Section 2: Đổi điểm lấy ưu đãi (only for Admin) */}
                {acquisitionReceipt ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">
                    <p className="font-bold">Đã nhận voucher</p>
                    <p className="mt-1 break-all">Mã: {acquisitionReceipt.acquired.qr_token}</p>
                    {acquisitionReceipt.refreshError ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span>Chưa làm mới được ví.</span>
                        <button
                          type="button"
                          className="min-h-11 rounded-lg bg-emerald-700 px-3 font-bold text-white"
                          onClick={onRetryVoucherRefresh}
                        >
                          Làm mới ví
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {availableVoucherPackages.length > 0 && customerInfo?.type === "existing" && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="font-bold text-primary text-sm">Đổi điểm lấy ưu đãi</h4>
                      <span className="bg-yellow-100 text-yellow-800 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">Cho khách</span>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {availableVoucherPackages.map((p) => (
                        <PackageCard 
                          key={p.id}
                          pkg={p}
                          userBalance={customerInfo.data.points_balance}
                          onExchange={() => onExchangeVoucher && onExchangeVoucher(p.id)}
                          isExchanging={isExchanging}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-border shrink-0 bg-card">
                <button
                  onClick={() => setIsDiscountPickerOpen(false)}
                  className="w-full bg-primary text-primary-foreground rounded-2xl h-12 font-bold text-sm"
                >
                  Xác nhận
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Product Modal Node for Staff */}
        {productModalNode}
        {bundleSetupVoucher && menuData && onCloseBundleSetup && onValidateBundleDraft && onCommitBundleDraft && onBundleSetupSuccess ? (
          <BundleVoucherSetupSheet
            key={bundleSetupVoucher.qr_token}
            open
            layer="critical"
            voucher={bundleSetupVoucher}
            cartItems={cart}
            bundleApplications={bundleApplications}
            initialApplication={bundleSetupApplication}
            menuData={menuData}
            milkTypes={menuData.milk_types}
            powders={powderData?.data ?? []}
            defaultPowderGram={powderData?.default_powder_gram ?? []}
            onClose={onCloseBundleSetup}
            onValidateDraft={onValidateBundleDraft}
            onCommitDraft={onCommitBundleDraft}
            onSuccess={onBundleSetupSuccess}
          />
        ) : null}
        <ConfirmModal
          isOpen={bundleTokenToRemove !== null}
          onCancel={() => setBundleTokenToRemove(null)}
          onConfirm={() => {
            if (bundleTokenToRemove) {
              const result = onRequestRemoveBundle(bundleTokenToRemove);
              if (!result.ok) {
                void import("sonner").then(({ toast }) => toast.error(result.message));
                return;
              }
            }
            setBundleTokenToRemove(null);
          }}
          title="Gỡ ưu đãi BUNDLE"
          message="Chỉ quà mà ưu đãi đã thêm sẽ được gỡ; các món khách đã chọn mua vẫn được giữ lại."
          confirmLabel="Gỡ ưu đãi"
          isDestructive={true}
        />
        
        </>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
