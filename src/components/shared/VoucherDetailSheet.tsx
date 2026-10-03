"use client";

import React from "react";
import { VoucherMenuTargetCard, VoucherTargetCard } from "./VoucherTargetCard";
import { VoucherCardFrame } from "./VoucherCardFrame";
import OptionCard from "./product-modal/OptionCard";
import { formatCartMoney, formatKa } from "@/src/utils/display";
import { CartMoney } from "./CartMoney";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCartStore, type PendingAddonVoucherIntent } from "@/src/lib/store/cartStore";
import { useAddVoucherToCart } from "@/src/hooks/useAddVoucherToCart";
import {
  canApplyDiscount,
  canApplyFreeship,
} from "@/src/lib/utils/voucherUseNowHelpers";
import {
  canApplyOwnedVoucher,
  canExchange,
  getVoucherAvailabilityMessage,
  formatVoucherExpiry,
  formatExpiryLabel,
} from "@/src/lib/utils/voucherModalHelpers";
import { AddonItemPicker } from "./AddonItemPicker";
import { ProductDiscountItemPicker } from "./ProductDiscountItemPicker";
import { ScopedMenuVoucherPicker } from "./ScopedMenuVoucherPicker";
import type { CartItem } from "@/src/lib/types/cart";
import type { CartMutationResult } from "@/src/lib/utils/cartTransitions";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";
import { selectOrderVoucherToken } from "@/src/utils/customerVoucherSelection";


interface OwnedVoucherDetailSheetProps {
  overlayOpen?: boolean;
  onChildOpenChange?: (open: boolean) => void;
  onAddVoucherItem?: (item: Omit<CartItem, "cartId">) => CartMutationResult<unknown>;
  voucher: MyVoucher;
  cartItems: CartItem[];
  subtotalVnd: number;
  totalAfterDiscountVnd?: number;
  myVouchers: MyVoucher[];
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
  menuData?: MenuData;
  bundleAllocatedQuantitiesByCartId: ReadonlyMap<string, number>;
  onBack: () => void;
  onUseNowSuccess: () => void;
  onOpenBundleSetup: (voucher: MyVoucher) => void;
  onRequestRefund: (voucher: MyVoucher) => void;
  isRefunding: boolean;
  /** Lock cart/wallet mutations while the voucher query is revalidating. */
  canEdit?: boolean;
  /** Explain why a cached voucher is read-only while its wallet is being verified. */
  editDisabledReason?: string;
  onSelectProductDiscountTarget?: (voucher: MyVoucher) => void;
  onRemoveAppliedVoucher?: () => void;
  /** Cart context: delegate PRODUCT/ITEM "Dùng ngay" to parent. */
  onUseProductVoucher?: (voucher: MyVoucher) => void;
  /** Cart context: keep order-level selection in the caller-owned cart store. */
  onSelectOrderVoucher?: (voucher: MyVoucher) => void;
  /** Cart context: keep ADDON mutations in the caller-owned cart store. */
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
  /** Close the owning wallet overlay before routing to select a new drink. */
  onPendingAddon?: () => void;
  packageData?: never;
}

interface PackageVoucherDetailSheetProps {
  packageData: VoucherPackage;
  voucher?: never;
  menuData?: MenuData;
  powderLabels?: ReadonlyMap<string, string>;
  pointsBalance: number;
  isLoggedIn: boolean;
  isExchanging: boolean;
  onBack: () => void;
  onExchange: (pkg: VoucherPackage) => void;
  onLogin: (pkg: VoucherPackage) => void;
}

type VoucherDetailSheetProps =
  | OwnedVoucherDetailSheetProps
  | PackageVoucherDetailSheetProps;

function VoucherDetailPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: "12%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "12%" }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="absolute inset-0 z-20 flex h-full w-full flex-col overflow-hidden bg-background"
    >
      {children}
    </motion.div>
  );
}

function PackageActionFooter({ pkg, isLoggedIn, pointsBalance, isExchanging, onExchange, onLogin }: {
  pkg: VoucherPackage;
  isLoggedIn: boolean;
  pointsBalance: number;
  isExchanging: boolean;
  onExchange?: (pkg: VoucherPackage) => void;
  onLogin?: (pkg: VoucherPackage) => void;
}) {
  if (isLoggedIn) {
    const eligibility = canExchange(pkg, pointsBalance, pkg.user_redeemed_count ?? 0);
    return (
      <>
        {eligibility.reason === "insufficient_points" && (
          <p className="mb-3 text-center text-sm text-destructive">Bạn cần thêm {(pkg.points_cost - pointsBalance).toLocaleString("vi-VN")} 🐟 để đổi ưu đãi này.</p>
        )}
        {eligibility.reason === "sold_out" && <p className="mb-3 text-center text-sm text-destructive">Gói ưu đãi đã hết số lượng.</p>}
        {eligibility.reason === "limit_reached" && <p className="mb-3 text-center text-sm text-destructive">Bạn đã nhận đủ số lượt cho phép của gói này.</p>}
        <motion.button type="button" whileTap={{ scale: 0.96 }} aria-busy={isExchanging}
          disabled={isExchanging || !onExchange || !eligibility.ok || pkg.acquisition_mode === "AUTO_GRANT"}
          onClick={() => onExchange?.(pkg)}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring">
          {isExchanging && <Loader2 className="size-5 animate-spin" />}
          {pkg.acquisition_mode === "FREE_CLAIM" ? "Nhận miễn phí" : `Đổi ${pkg.points_cost} 🐟`}
        </motion.button>
      </>
    );
  }
  return (
    <motion.button type="button" whileTap={{ scale: 0.96 }} aria-busy={isExchanging}
      disabled={isExchanging || !onLogin || pkg.acquisition_mode === "AUTO_GRANT"}
      onClick={() => onLogin?.(pkg)}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring">
      {isExchanging ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}Đăng nhập để nhận ưu đãi
    </motion.button>
  );
}

function PackageVoucherDetailSheet({
  packageData,
  menuData,
  pointsBalance,
  isLoggedIn,
  isExchanging,
  onBack,
  onExchange,
  onLogin,
}: PackageVoucherDetailSheetProps) {
  const liveMenuTargets = (packageData.eligible_menu_items ?? []).filter((target) => target.is_available);
  const liveAddonTargets = (packageData.eligible_addon_options ?? []).filter((target) => target.is_active && !target.is_dynamic_gram);
  return (
    <VoucherDetailPanel>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại danh sách voucher"
          className="flex size-11 items-center justify-center rounded-full bg-primary/5 transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-5 text-primary" />
        </button>
        <h3 className="font-bold text-primary">Chi tiết voucher</h3>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-5">
        <VoucherCardFrame title={packageData.name} description={packageData.description} expiresAfterDays={packageData.expires_after_days} />

        <div className="space-y-4">
          <div className="space-y-1">
            <h5 className="text-xs font-bold uppercase tracking-widest text-primary">Mô tả</h5>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/80">
              {packageData.description || "Không có mô tả chi tiết."}
            </p>
          </div>
          {liveMenuTargets.length > 0 && ["PRODUCT", "ITEM", "PRODUCT_DISCOUNT"].includes(packageData.voucher_type) ? (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Lựa chọn còn dùng được</h5>
              <div className="space-y-2">
                {liveMenuTargets.map((target) => {
                  const item = [...(menuData?.latte ?? []), ...(menuData?.fusion ?? []), ...(menuData?.extras ?? [])].find((candidate) => candidate.id === target.menu_item_id);
                  return (
                    <div key={target.menu_item_id} className="space-y-1">
                      {item && menuData ? <VoucherMenuTargetCard item={item} menuData={menuData}
                        allowedSizes={packageData.voucher_type === "PRODUCT_DISCOUNT" ? packageData.eligible_sizes : undefined}
                        configuration={{ size: target.size, powderId: target.matcha_powder_id, baseLiquidId: target.milk_type_id ?? packageData.milk_type_id }} />
                        : <VoucherTargetCard name={target.name} description={menuData ? "Không còn khả dụng" : "Đang tải cấu hình món…"} disabled />}
                      {packageData.voucher_type === "PRODUCT" ? <p className="text-right text-xs font-semibold text-primary">Giá trị được tặng: {formatKa(target.covered_price_vnd ?? 0)}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {packageData.voucher_type === "ADDON" && liveAddonTargets.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-widest text-primary">Topping được chọn</h5>
              <div className="grid grid-cols-3 gap-2">
                {liveAddonTargets.map((target) => {
                  const group = menuData?.addon_groups.find((candidate) => candidate.options.some((option) => option.id === target.addon_option_id));
                  const option = group?.options.find((candidate) => candidate.id === target.addon_option_id);
                  return <OptionCard key={target.addon_option_id} label={target.label} imageUrl={option?.image_url ?? group?.image_url} imageAlt={target.label} sub={formatKa(option?.price_vnd ?? target.price_vnd)} isActive={false} layout="stacked" />;
                })}
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <h5 className="text-xs font-bold uppercase tracking-widest text-primary">Hạn sử dụng</h5>
            <p className="text-sm text-primary/80">
              {packageData.expires_after_days !== null
                ? `Sau khi nhận: ${formatExpiryLabel(packageData.expires_after_days)}`
                : "Không giới hạn"}
            </p>
          </div>
          {packageData.min_order_vnd !== null && packageData.min_order_vnd > 0 ? (
            <div className="space-y-1">
              <h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Điều kiện</h5>
              <p className="text-sm text-primary/80">
                Giá trị đơn tối thiểu: {packageData.min_order_vnd.toLocaleString("vi-VN")}đ
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/40 bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <PackageActionFooter
          pkg={packageData}
          isLoggedIn={isLoggedIn}
          pointsBalance={pointsBalance}
          isExchanging={isExchanging}
          onExchange={onExchange}
          onLogin={onLogin}
        />
      </div>
    </VoucherDetailPanel>
  );
}

const OwnedVoucherDetailSheet = ({
  voucher,
  cartItems,
  subtotalVnd,
  totalAfterDiscountVnd,
  myVouchers,
  orderType,
  shippingFee,
  menuData,
  bundleAllocatedQuantitiesByCartId,
  onBack,
  onUseNowSuccess,
  onOpenBundleSetup,
  onRequestRefund,
  isRefunding,
  onSelectProductDiscountTarget,
  onRemoveAppliedVoucher,
  onUseProductVoucher,
  onSelectOrderVoucher,
  onApplyAddonVoucher,
  onSavePendingAddonVoucher,
  onPendingAddon,
  onAddVoucherItem,
  overlayOpen = true,
  onChildOpenChange,
  canEdit = true,
  editDisabledReason,
}: OwnedVoucherDetailSheetProps) => {
  const router = useRouter();
  const { addToCart, loading } = useAddVoucherToCart();
  const { setSelectedVoucherIds, selectedVoucherIds } = useCartStore();
  const productDiscountReady = voucher.voucher_type !== "PRODUCT_DISCOUNT" || menuData !== undefined;

  // Checks based on voucher type
  let canApply = canApplyOwnedVoucher(voucher);
  let deficit = 0;
  let disabledReason = getVoucherAvailabilityMessage(voucher) ?? "";

  if (canApply && voucher.voucher_type === "DISCOUNT") {
    const res = canApplyDiscount(voucher, subtotalVnd);
    canApply = res.canApply;
    deficit = res.deficitVnd;
    if (!canApply) disabledReason = `Cần thêm ${formatCartMoney(deficit)} để sử dụng voucher`;
  } else if (canApply && voucher.voucher_type === "FREESHIP") {
    const res = canApplyFreeship(orderType, totalAfterDiscountVnd ?? subtotalVnd, voucher.min_order_vnd, shippingFee);
    canApply = res.canApply;
    deficit = res.deficitVnd;
    if (deficit > 0) {
      disabledReason = `Cần thêm ${formatCartMoney(deficit)} để sử dụng voucher`;
    } else if (!canApply) {
      disabledReason = res.reason ?? "Voucher giao hàng chưa thể sử dụng";
    }
  }
  if (!canEdit) {
    canApply = false;
    disabledReason = editDisabledReason ?? "Ví voucher đang được xác minh lại.";
  }

  const vType = voucher.voucher_type;
  const hasInlineTargets = ["PRODUCT", "PRODUCT_DISCOUNT", "ITEM", "ADDON"].includes(vType);

  const handleUseNow = async () => {
    if (!canEdit) return;
    // In-cart context: delegate to CartDiscountPicker's target selection flow
    if (voucher.voucher_type === "PRODUCT_DISCOUNT" && onSelectProductDiscountTarget) {
      onSelectProductDiscountTarget(voucher);
      return;
    }
    if (!canApply) return;

    if (vType === "PRODUCT_DISCOUNT") {
      if (!productDiscountReady) return;
      return;
    }

    if (vType === "PRODUCT" || vType === "ITEM") {
      if (onUseProductVoucher) { onUseProductVoucher(voucher); return; }
      const res = await addToCart(voucher);
      if (res.ok) {
        onUseNowSuccess();
      } else {
        const msg = res.reason === "item_unavailable"
          ? "Món này đã ngừng phục vụ"
          : res.reason === "size_unavailable"
          ? "Size trong voucher không còn khả dụng"
          : "Không thể áp dụng ưu đãi. Vui lòng thử lại.";
        import("sonner").then(m => m.toast.error(msg));
      }
      return;
    }

    if (vType === "ADDON") return;

    if (vType === "DISCOUNT" || vType === "FREESHIP") {
      if (canApply) {
        if (onSelectOrderVoucher) onSelectOrderVoucher(voucher);
        else setSelectedVoucherIds(selectOrderVoucherToken(selectedVoucherIds, voucher, myVouchers));
        onUseNowSuccess();
      }
      return;
    }

    if (vType === "BUNDLE") {
      onOpenBundleSetup(voucher);
      return;
    }
  };

  return (
    <VoucherDetailPanel>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-card">
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại danh sách voucher"
          className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h3 className="font-bold text-primary">Chi tiết voucher</h3>
      </div>

      <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-5 space-y-6">
        <VoucherCardFrame title={voucher.package.name} description={voucher.package.description} expiresAt={voucher.expires_at} />

        <div className="space-y-4">
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-primary uppercase tracking-widest">Mô tả</h5>
            <p className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap">
              {voucher.package.description || "Không có mô tả chi tiết."}
            </p>
          </div>
          
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-primary uppercase tracking-widest">Hạn sử dụng</h5>
            <p className="text-sm text-primary/80">
              {formatVoucherExpiry(voucher.expires_at)}
            </p>
          </div>

          {voucher.min_order_vnd != null && voucher.min_order_vnd > 0 && (
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-primary/50 uppercase tracking-widest">Điều kiện</h5>
              <p className="text-sm text-primary/80">
                Giá trị đơn tối thiểu: {onSelectOrderVoucher ? <CartMoney amountVnd={voucher.min_order_vnd} /> : `${voucher.min_order_vnd.toLocaleString("vi-VN")}đ`}
              </p>
            </div>
          )}
        </div>

        {hasInlineTargets && !menuData ? (
          <p className="rounded-xl border border-border bg-secondary/20 p-4 text-center text-sm text-muted-foreground">Đang tải danh sách món phù hợp…</p>
        ) : null}
        {hasInlineTargets && menuData && vType === "PRODUCT_DISCOUNT" ? (
          <ProductDiscountItemPicker open={overlayOpen} onChildOpenChange={onChildOpenChange} onAddItem={onAddVoucherItem} voucher={voucher} menuData={menuData} canEdit={canEdit && canApply} onSuccess={onUseNowSuccess} />
        ) : null}
        {hasInlineTargets && menuData && (vType === "PRODUCT" || vType === "ITEM") ? (
          <ScopedMenuVoucherPicker open={overlayOpen} onChildOpenChange={onChildOpenChange} onAddItem={onAddVoucherItem} voucher={voucher} menuData={menuData} canEdit={canEdit && canApply} onSuccess={onUseNowSuccess} />
        ) : null}
        {hasInlineTargets && menuData && vType === "ADDON" ? (
          <AddonItemPicker
            voucher={voucher}
            cartItems={cartItems}
            bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
            menuData={menuData}
            canEdit={canEdit && canApply}
            embedded
            onSuccess={onUseNowSuccess}
            onApplyVoucher={onApplyAddonVoucher}
            onSavePendingVoucher={onSavePendingAddonVoucher}
            onPending={() => {
              if (onPendingAddon) onPendingAddon();
              else {
                onBack();
                router.push("/menu");
              }
            }}
          />
        ) : null}
      </div>

      <div className="p-5 bg-card border-t border-border/40 pb-[max(1.25rem,env(safe-area-inset-bottom))] shrink-0">
        <>
            {vType === "PRODUCT_DISCOUNT" && !productDiscountReady && (
              <p className="mb-3 text-center text-xs text-rose-500">Đang tải sản phẩm phù hợp…</p>
            )}
            {!canApply && disabledReason && (
              <p className="text-center text-xs text-rose-500 mb-3">{disabledReason}</p>
            )}
            <div className="grid gap-2">
              {onRemoveAppliedVoucher ? (
                <button
                  type="button"
                  onClick={onRemoveAppliedVoucher}
                  disabled={!canEdit}
                  className="min-h-12 w-full rounded-xl border border-destructive bg-destructive/10 px-4 font-bold text-destructive transition-colors hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hủy voucher
                </button>
              ) : !hasInlineTargets ? (
                <button
                  type="button"
                  onClick={handleUseNow}
                  disabled={!canEdit || !canApply || !productDiscountReady || loading || isRefunding || voucher.status !== "ACTIVE"}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    vType === "BUNDLE" ? "Chọn món cho ưu đãi" :
                    vType === "PRODUCT_DISCOUNT" ? "Chọn món áp dụng" :
                    "Dùng ngay"
                  )}
                </button>
              ) : null}
              {voucher.availability.can_refund ? (
                <button
                  type="button"
                  onClick={() => onRequestRefund(voucher)}
                  disabled={!canEdit || isRefunding}
                  className="min-h-11 w-full rounded-xl border border-destructive/40 bg-background px-4 font-bold text-destructive transition-colors hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hoàn {voucher.availability.refund_points.toLocaleString("vi-VN")} điểm
                </button>
              ) : null}
            </div>
        </>
      </div>

    </VoucherDetailPanel>
  );
};

/** Render either an owned voucher or an exchangeable package detail surface. */
export function VoucherDetailSheet(props: VoucherDetailSheetProps) {
  if (props.packageData !== undefined) {
    return <PackageVoucherDetailSheet {...props} />;
  }

  return <OwnedVoucherDetailSheet {...props} />;
}
