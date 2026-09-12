"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useAddVoucherToCart } from "@/src/hooks/useAddVoucherToCart";
import {
  canApplyDiscount,
  canApplyFreeship,
} from "@/src/lib/utils/voucherUseNowHelpers";
import {
  canApplyOwnedVoucher,
  canExchange,
  getTicketHighlightText,
  getVoucherAvailabilityMessage,
  getVoucherBenefitText,
  getPackageBenefitText,
  formatVoucherExpiry,
  formatExpiryLabel,
  VOUCHER_TYPE_CONFIG,
} from "@/src/lib/utils/voucherModalHelpers";
import { cn } from "@/src/utils/cn";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { AddonItemPicker } from "./AddonItemPicker";
import { ProductDiscountItemPicker } from "./ProductDiscountItemPicker";
import { ScopedMenuVoucherPicker } from "./ScopedMenuVoucherPicker";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";


interface OwnedVoucherDetailSheetProps {
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
  powderLabels,
  pointsBalance,
  isLoggedIn,
  isExchanging,
  onBack,
  onExchange,
  onLogin,
}: PackageVoucherDetailSheetProps) {
  const config = VOUCHER_TYPE_CONFIG[packageData.voucher_type] ?? VOUCHER_TYPE_CONFIG.DISCOUNT;
  const highlight = getTicketHighlightText(
    packageData.voucher_type,
    packageData.discount_type,
    packageData.discount_value,
    packageData.reference_size,
  );
  const liveMenuTargets = (packageData.eligible_menu_items ?? []).filter((target) => target.is_available);
  const liveAddonTargets = (packageData.eligible_addon_options ?? []).filter((target) => target.is_active && !target.is_dynamic_gram);
  const liquidLabels = new Map(
    [...(menuData?.milk_types ?? []), ...(menuData?.base_liquids ?? [])].map((liquid) => [liquid.id, liquid.name]),
  );
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
        <h3 className="font-bold text-primary">Chi tiết ưu đãi</h3>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-5">
        <div className="flex overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed bg-primary/5 p-3">
            <span className="text-xl font-bold text-primary">{highlight.text}</span>
            <span className="text-xs font-medium text-primary/70">{highlight.subtext}</span>
          </div>
          <div className="flex-1 p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h4 className="line-clamp-2 text-sm font-bold text-primary">{packageData.name}</h4>
              <span className={cn("whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold", config.badgeCls)}>
                {config.label}
              </span>
            </div>
            <p className="text-xs text-primary/70">{getPackageBenefitText(packageData)}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Mô tả</h5>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary/80">
              {packageData.description || "Không có mô tả chi tiết."}
            </p>
          </div>
          {liveMenuTargets.length > 0 && ["PRODUCT", "ITEM", "PRODUCT_DISCOUNT"].includes(packageData.voucher_type) ? (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Lựa chọn còn dùng được</h5>
              <div className="space-y-2">
                {liveMenuTargets.map((target) => (
                  <div key={target.menu_item_id} className="rounded-xl border border-border/60 bg-card p-3 text-sm">
                    <p className="font-bold text-primary">{target.name}</p>
                    {packageData.voucher_type === "PRODUCT" ? (
                      <>
                        <p className="mt-1 text-xs text-primary/65">
                          Size {target.size ? <SizeLabel size={target.size} /> : "hiện tại"}
                          {target.matcha_powder_id ? ` · Bột ${powderLabels?.get(target.matcha_powder_id) ?? "mặc định hiện tại"}` : ""}
                          {target.milk_type_id ? ` · Nền ${liquidLabels.get(target.milk_type_id) ?? "mặc định hiện tại"}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-green-700">
                          Giá trị được tặng: {(target.covered_price_vnd ?? 0).toLocaleString("vi-VN")}đ
                        </p>
                      </>
                    ) : packageData.voucher_type === "PRODUCT_DISCOUNT" && (packageData.eligible_sizes?.length ?? 0) > 0 ? (
                      <p className="mt-1 text-xs text-primary/65">
                        Size áp dụng: {packageData.eligible_sizes?.map((size, index) => (
                          <React.Fragment key={size}>
                            {index > 0 ? ", " : null}<SizeLabel size={size} />
                          </React.Fragment>
                        ))}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {packageData.voucher_type === "ADDON" && liveAddonTargets.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Topping được chọn</h5>
              <div className="space-y-2">
                {liveAddonTargets.map((target) => (
                  <div key={target.addon_option_id} className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-3 text-sm">
                    <span className="font-bold text-primary">{target.label}</span>
                    <span className="font-semibold text-green-700">Tối đa {target.price_vnd.toLocaleString("vi-VN")}đ</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Hạn sử dụng</h5>
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
  onPendingAddon,
  canEdit = true,
  editDisabledReason,
}: OwnedVoucherDetailSheetProps) => {
  const router = useRouter();
  const { addToCart, loading } = useAddVoucherToCart();
  const { setCartOpen, setSelectedVoucherIds, setPendingAddonVoucher, selectedVoucherIds } = useCartStore();
  const [showAddonPicker, setShowAddonPicker] = useState(false);
  const [showProductDiscountPicker, setShowProductDiscountPicker] = useState(false);
  const [showScopedMenuPicker, setShowScopedMenuPicker] = useState(false);
  const productDiscountReady = voucher.voucher_type !== "PRODUCT_DISCOUNT" || menuData !== undefined;

  // Checks based on voucher type
  let canApply = canApplyOwnedVoucher(voucher);
  let deficit = 0;
  let disabledReason = getVoucherAvailabilityMessage(voucher) ?? "";

  if (canApply && voucher.voucher_type === "DISCOUNT") {
    const res = canApplyDiscount(voucher, subtotalVnd);
    canApply = res.canApply;
    deficit = res.deficitVnd;
    if (!canApply) disabledReason = `Thiếu ${(deficit / 1000).toLocaleString("vi-VN")}K để sử dụng`;
  } else if (canApply && voucher.voucher_type === "FREESHIP") {
    const res = canApplyFreeship(orderType, totalAfterDiscountVnd ?? subtotalVnd, voucher.min_order_vnd, shippingFee);
    canApply = true;
    deficit = res.deficitVnd;
    if (deficit > 0) {
      canApply = false;
      disabledReason = `Thiếu ${(deficit / 1000).toLocaleString("vi-VN")}K để sử dụng`;
    }
  }
  if (!canEdit) {
    canApply = false;
    disabledReason = editDisabledReason ?? "Ví voucher đang được xác minh lại.";
  }

  const vType = voucher.voucher_type;
  const config = VOUCHER_TYPE_CONFIG[vType] || { label: "Voucher", badgeCls: "bg-gray-100 text-gray-800" };
  const highlight = getTicketHighlightText(vType, voucher.discount_type, voucher.discount_value, voucher.reference_size);

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
      // Open item picker so customer can select item + customize via ProductModal
      setShowProductDiscountPicker(true);
      return;
    }

    if (vType === "PRODUCT" || vType === "ITEM") {
      if ((voucher.eligible_menu_items?.length ?? 0) > 1) {
        setShowScopedMenuPicker(true);
        return;
      }
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

    if (vType === "ADDON") {
      setShowAddonPicker(true);
      return;
    }

    if (vType === "DISCOUNT" || vType === "FREESHIP") {
      if (canApply) {
        if (!selectedVoucherIds.includes(voucher.qr_token)) {
          const filteredIds = voucher.discount_type === "PERCENT"
            ? selectedVoucherIds.filter(id => {
                const existing = myVouchers.find(v => v.qr_token === id);
                return existing?.discount_type !== "PERCENT";
              })
            : selectedVoucherIds;
          setSelectedVoucherIds([...filteredIds, voucher.qr_token]);
        }
        setCartOpen(true);
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
        <h3 className="font-bold text-primary">Chi tiết ưu đãi</h3>
      </div>

      <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain p-5 space-y-6">
        <div className="flex bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="w-24 bg-primary/5 flex flex-col items-center justify-center p-3 border-r border-dashed shrink-0">
            <span className="font-bold text-xl text-primary">{highlight.text}</span>
            <span className="text-xs font-medium text-primary/70">{highlight.subtext}</span>
          </div>
          <div className="p-4 flex-1">
            <div className="flex justify-between items-start gap-2 mb-2">
              <h4 className="font-bold text-sm text-primary line-clamp-2">
                {voucher.package.name}
              </h4>
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap", config.badgeCls)}>
                {config.label}
              </span>
            </div>
            <p className="text-xs text-primary/70">
              {getVoucherBenefitText(voucher)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-primary/50 uppercase tracking-widest">Mô tả</h5>
            <p className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap">
              {voucher.package.description || "Không có mô tả chi tiết."}
            </p>
          </div>
          
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-primary/50 uppercase tracking-widest">Hạn sử dụng</h5>
            <p className="text-sm text-primary/80">
              {formatVoucherExpiry(voucher.expires_at)}
            </p>
          </div>

          {voucher.min_order_vnd != null && voucher.min_order_vnd > 0 && (
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-primary/50 uppercase tracking-widest">Điều kiện</h5>
              <p className="text-sm text-primary/80">
                Giá trị đơn tối thiểu: {voucher.min_order_vnd.toLocaleString("vi-VN")}đ
              </p>
            </div>
          )}
        </div>
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
              ) : (
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
              )}
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

      <AnimatePresence>
        {showAddonPicker && menuData && (
          <AddonItemPicker
            voucher={voucher}
            cartItems={cartItems}
            bundleAllocatedQuantitiesByCartId={bundleAllocatedQuantitiesByCartId}
            menuData={menuData}
            canEdit={canEdit}
            onBack={() => setShowAddonPicker(false)}
            onSuccess={() => {
              setShowAddonPicker(false);
              onUseNowSuccess();
            }}
            onPending={(intent) => {
              setPendingAddonVoucher(intent);
              setShowAddonPicker(false);
              if (onPendingAddon) onPendingAddon();
              else onBack();
              router.push("/menu");
            }}
          />
        )}
        {showProductDiscountPicker && menuData && (
          <ProductDiscountItemPicker
            voucher={voucher}
            menuData={menuData}
            canEdit={canEdit}
            onBack={() => setShowProductDiscountPicker(false)}
            onSuccess={() => {
              setShowProductDiscountPicker(false);
              onUseNowSuccess();
            }}
          />
        )}
        {showScopedMenuPicker && menuData && (
          <ScopedMenuVoucherPicker voucher={voucher} menuData={menuData} canEdit={canEdit} onBack={() => setShowScopedMenuPicker(false)} onSuccess={() => { setShowScopedMenuPicker(false); onUseNowSuccess(); }} />
        )}
      </AnimatePresence>
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
