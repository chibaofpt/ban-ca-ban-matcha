"use client";

import React, { useState, useMemo, useCallback } from "react";
import { User, UserX, Ticket, ArrowLeft, ChevronRight, X } from "lucide-react";
import type { BundleCreatedRewardEffect, BundleCartDraftCommit, CartBundleApplication, ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuData, Size, SweetnessLevel } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { CustomerInfo } from "./CustomerSelectModal";
import type { MyVoucher } from "@/src/services/staffVoucherService";
import { formatVietnamPhone } from "@/src/utils/display";
import { CartMoney } from "@/src/components/shared/CartMoney";
import { CartPaymentSummary } from "@/src/components/shared/CartPaymentSummary";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import {
  buildProductVoucherMap,
  getAvailableCartItemVouchers,
  buildAddonVoucherMap,
  getAddonVoucherTargetChoices,
} from "@/src/utils/voucherMatchUtils";
import { motion, AnimatePresence } from "framer-motion";
import { ResponsiveOverlay } from "@/src/components/ui/ResponsiveOverlay";
import StaffCartItemCard from "./cart/StaffCartItemCard";
import { VoucherCard, VoucherSelectionIndicator } from "@/src/components/shared/VoucherCards";
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
  layoutVariant?: "admin-mobile" | "staff";
  voucherPickerNode?: React.ReactNode;
  onAfterClose?: () => void;
  menuData?: MenuData;
  powderData?: PowderApiResponse;
  isOpen: boolean;
  cart: ProjectedCartLine[];
  getProductVoucherBenefit: (item: ProjectedCartLine, voucher: MyVoucher) => number;
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
  onOpenVoucherPicker?: () => void;
  onApplyProduct?: (cartId: string, voucher: MyVoucher) => CartMutationResult;
  onRemoveProduct?: (cartId: string) => CartMutationResult;
  onApplyAddon?: (cartId: string, voucher: MyVoucher, addonOptionId: string) => CartMutationResult;
  onRemoveAddon?: (cartId: string, voucherId: string) => CartMutationResult;
  productModalNode?: React.ReactNode;
  onClearCart?: () => void;
  preventCloseOutside?: boolean;
  checkoutBlocked?: boolean;
  voucherRevalidating?: boolean;
  persistenceWarning?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StaffCartDrawer({
  menuData,
  layoutVariant = "staff",
  voucherPickerNode,
  onAfterClose,
  powderData,
  isOpen,
  cart,
  getProductVoucherBenefit,
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
  onOpenVoucherPicker,
  onApplyProduct,
  onRemoveProduct,
  onApplyAddon,
  onRemoveAddon,
  productModalNode,
  onClearCart,
  preventCloseOutside = false,
  checkoutBlocked = false,
  persistenceWarning = null,
}: StaffCartDrawerProps) {
  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion, ...(menuData.extras ?? [])] : [];

  const [activeItemForVoucher, setActiveItemForVoucher] = useState<string | null>(null);
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
  const totalDiscountVnd = cartProjection.totals.items_discount_vnd + cartProjection.totals.total_voucher_discount_vnd + cartProjection.totals.freeship_discount_vnd;
  const totalVnd = cartProjection.totals.grand_total_vnd;
  const earnedPoints = customerInfo ? Math.floor(cartProjection.totals.total_vnd / 10_000) : 0;
  const appliedVoucherCount = new Set([
    ...selectedDiscountIds,
    ...bundleApplications.map((application) => application.voucher_qr_token),
    ...cart.flatMap((item) => [
      ...(item.lineVoucher ? [item.lineVoucher.token] : []),
      ...item.addonVouchers.map((voucher) => voucher.token),
    ]),
  ]).size;

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

  const handleClose = useCallback(() => { if (!preventCloseOutside) onClose(); }, [onClose, preventCloseOutside]);

  return (
    <ResponsiveOverlay open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }} title="Giỏ hàng" presentation="bare" backdropClassName="bg-black/40 backdrop-blur-none" dismissPolicy={preventCloseOutside ? "explicit-only" : "default"} onAfterClose={() => { setActiveItemForVoucher(null); setAddonChoiceVoucherId(null); onAfterClose?.(); }} className="flex max-h-[100dvh] flex-col rounded-t-3xl bg-card shadow-2xl md:max-h-[90dvh] md:max-w-2xl">
          <div className="flex justify-center pt-2 pb-1 w-full shrink-0">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 py-1.5 shrink-0 border-b border-border/40">
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-base font-bold flex items-center gap-2">
                Giỏ hàng <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">{cart.reduce((sum, c) => sum + c.quantity, 0)}</span>
              </h2>
              {cart.length > 0 && onClearCart ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={onClearCart}
                  className="flex h-8 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 px-2 text-[10px] font-bold text-red-600 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Xoá tất cả
                </motion.button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Đóng giỏ hàng"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/50 transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={14} />
            </button>
          </div>
          {persistenceWarning ? (
            <div className="mx-4 mt-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-primary" role="status">
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
                    ? (customerInfo.type === "existing" ? `${customerInfo.data.email ?? (customerInfo.data.phone_number ? formatVietnamPhone(customerInfo.data.phone_number) : "")} • 🐟 ${customerInfo.data.points_balance}` : customerInfo.email)
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
          className="min-h-0 flex-[0_1_auto] space-y-2 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-3 sm:p-4"
        >
          {cart.length === 0 ? (
             <div className="text-center py-10 text-muted-foreground space-y-3">
               <span className="text-5xl block">🛒</span>
               <p className="font-medium text-sm">Giỏ hàng đang trống</p>
             </div>
          ) : (
            [...cart].reverse().map((c, index) => {
              const productVouchersForItem = getBundleOutsideQuantity(c, bundleAllocatedQuantitiesByCartId) > 0
                ? applicableProductVouchers.get(c.menuItemId) || []
                : [];
              const addonVouchersForItem = (applicableAddonVouchersMap.get(c.cartId) || []).filter((voucher) => {
                return addonChoicesFor(voucher, c).length > 0;
              });
              const menuItem = menuItems.find(m => m.id === c.menuItemId);

              return (
                <StaffCartItemCard
                  layoutVariant={layoutVariant}
                  key={c.cartId}
                  item={c}
                  availableVoucherCount={getAvailableCartItemVouchers({ item: c, cart, vouchers: customerVouchers, bundleApplications, getProductBenefit: getProductVoucherBenefit }).length}
                  voucherMutationDisabled={checkoutBlocked}
                  voucherDiscounts={cartProjection.totals.itemResults[cart.length - index - 1]}
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
          {cart.length > 0 ? (
            <CartPaymentSummary totals={cartProjection.totals} />
          ) : null}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="px-4 pt-3 pb-3 border-t border-border/50 bg-background/50 backdrop-blur-md shrink-0 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.1)]">
            <div className="flex gap-3">
              {/* Left Column - Vouchers & Points */}
              <div className="min-w-0 flex-1 space-y-2">
                {customerInfo?.type === "existing" && onOpenVoucherPicker && (
                  <button
                    type="button"
                    onClick={onOpenVoucherPicker}
                    className="w-full flex items-center justify-between gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-lg px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="bg-primary-foreground/10 p-1 rounded-md shrink-0">
                        <Ticket size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold leading-tight">Ưu đãi của khách</p>
                        <p className="text-[10px] text-primary-foreground leading-tight">
                          {appliedVoucherCount > 0
                            ? `${appliedVoucherCount} voucher đang áp`
                            : customerVouchers.length > 0
                              ? `Chọn trong ${customerVouchers.length} voucher`
                              : "Xem ví voucher"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-primary-foreground/70" />
                  </button>
                )}
                
                {/* Legacy discount from scanner */}
                {discountVoucher && !selectedDiscountIds.includes(discountVoucher.qr_token) && (
                  <div className="flex items-center justify-between bg-green-50/50 border border-green-200/50 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-green-700">🏷 Voucher quét mã</span>
                    <span className="text-xs font-bold text-green-700">Đã tính trong tổng</span>
                  </div>
                )}
                <PaymentMethodSelector
                  value={paymentMethod}
                  bankTransferDisabled={totalVnd <= 0}
                  onChange={onPaymentMethodChange}
                />
              </div>

              {/* Right Column - Totals */}
              <div className="w-[45%] min-w-0 flex flex-col gap-2 text-left">
                <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Tổng</span>
                  <span className="inline-flex flex-wrap items-baseline gap-1 font-serif text-xl font-bold text-primary">
                    <span className="whitespace-nowrap"><CartMoney amountVnd={totalVnd} /></span>
                    {earnedPoints > 0 ? <span className="whitespace-nowrap font-sans text-[10px]">(+{earnedPoints} điểm)</span> : null}
                  </span>
                </div>
                {totalDiscountVnd > 0 ? (
                  <p className="text-right text-[10px] font-semibold text-red-700">Được giảm <CartMoney amountVnd={totalDiscountVnd} /></p>
                ) : null}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={onCheckout}
                  disabled={isSubmitting || checkoutBlocked}
                  className="mt-auto flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-md transition disabled:pointer-events-none disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    "Chốt đơn"
                  )}
                </motion.button>
              </div>
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
                      {activeItem.category === "extras" ? "Add-on" : <>Size <SizeLabel size={activeItem.configuration.size} /></>}
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
                            actionNode={<VoucherSelectionIndicator selected={isSelected} />}
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
                            actionNode={<VoucherSelectionIndicator selected={isSelected} />}
                          />
                          {!isSelected && addonChoiceVoucherId === v.qr_token ? (
                            <div className="space-y-2 rounded-xl border border-border bg-muted/50 p-2" role="group" aria-label="Chọn topping được giảm">
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
                                  className="flex min-h-11 w-full items-center justify-between rounded-lg bg-card px-3 text-left text-sm font-semibold"
                                >
                                  <span>{choice.label}</span>
                                  <span className="text-primary">Giảm <CartMoney amountVnd={choice.discountVnd} /></span>
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

        {/* Product Modal Node for Staff */}
        {productModalNode}
        {voucherPickerNode}
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
    </ResponsiveOverlay>
  );
}
