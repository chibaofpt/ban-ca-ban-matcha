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
import { AddonItemPicker } from "./AddonItemPicker";
import { ProductDiscountItemPicker } from "./ProductDiscountItemPicker";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";
import { ceilTo1000 } from "@/src/utils/pricing";


interface OwnedVoucherDetailSheetProps {
  voucher: MyVoucher;
  cartItems: CartItem[];
  subtotalVnd: number;
  totalAfterDiscountVnd?: number;
  myVouchers: MyVoucher[];
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
  menuData?: MenuData;
  onBack: () => void;
  onUseNowSuccess: () => void;
  onOpenBundleSetup: (voucher: MyVoucher) => void;
  onRequestRefund: (voucher: MyVoucher) => void;
  isRefunding: boolean;
  onSelectProductDiscountTarget?: (voucher: MyVoucher) => void;
  onRemoveAppliedVoucher?: () => void;
  /** Cart context: delegate PRODUCT/ITEM "Dùng ngay" to parent. */
  onUseProductVoucher?: (voucher: MyVoucher) => void;
  /** Cart context: delegate ADDON "Dùng ngay" to parent. */
  onUseAddonVoucher?: (voucher: MyVoucher) => void;
  packageData?: never;
}

interface PackageVoucherDetailSheetProps {
  packageData: VoucherPackage;
  voucher?: never;
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

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="relative flex h-full w-full flex-col overflow-hidden bg-background"
    >
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

      <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
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
    </motion.div>
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
  onBack,
  onUseNowSuccess,
  onOpenBundleSetup,
  onRequestRefund,
  isRefunding,
  onSelectProductDiscountTarget,
  onRemoveAppliedVoucher,
  onUseProductVoucher,
  onUseAddonVoucher,
}: OwnedVoucherDetailSheetProps) => {
  const router = useRouter();
  const { addToCart, loading } = useAddVoucherToCart();
  const { setCartOpen, setSelectedVoucherIds, updateItem, applyAddonVoucher, selectedVoucherIds } = useCartStore();
  const [showAddonPicker, setShowAddonPicker] = useState(false);
  const [showProductDiscountPicker, setShowProductDiscountPicker] = useState(false);
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

  const vType = voucher.voucher_type;
  const config = VOUCHER_TYPE_CONFIG[vType] || { label: "Voucher", badgeCls: "bg-gray-100 text-gray-800" };
  const highlight = getTicketHighlightText(vType, voucher.discount_type, voucher.discount_value, voucher.reference_size);

  const handleUseNow = async () => {
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
      if (onUseAddonVoucher) { onUseAddonVoucher(voucher); return; }
      if (cartItems.length === 0) {
        onBack();
        router.push("/menu");
      } else if (cartItems.length === 1 && cartItems[0].quantity === 1) {
        const item = cartItems[0];
        const addonOptionId = voucher.addon_option_id!;
        const alreadyHasAddon = item.selectedOptionIds.includes(addonOptionId);
        if (!alreadyHasAddon) {
          let addonPrice = 0;
          let isExtraMatcha = false;
          if (menuData) {
            for (const group of menuData.addon_groups) {
              const opt = group.options.find(o => o.id === addonOptionId);
              if (opt) {
                if (opt.gram_value != null && opt.gram_value > 0) {
                  isExtraMatcha = true;
                }
                addonPrice = ceilTo1000(opt.price_vnd ?? 0);
                break;
              }
            }
          }
          if (isExtraMatcha) {
            import("sonner").then(m => m.toast.error("Voucher này không áp dụng cho Extra Matcha"));
            return;
          }
          updateItem(item.cartId, {
            selectedOptionIds: [...item.selectedOptionIds, addonOptionId],
            addonPrices: { ...item.addonPrices, [addonOptionId]: addonPrice },
            addonsPrice: item.addonsPrice + addonPrice,
          });
        }
        applyAddonVoucher(item.cartId, voucher.qr_token, addonOptionId);
        setCartOpen(true);
        onUseNowSuccess();
      } else {
        setShowAddonPicker(true);
      }
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
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="relative flex h-full w-full flex-col overflow-hidden bg-background"
    >
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

      <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-6">
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
                  className="min-h-12 w-full rounded-xl border border-destructive bg-destructive/10 px-4 font-bold text-destructive transition-colors hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hủy voucher
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUseNow}
                  disabled={!canApply || !productDiscountReady || loading || isRefunding || voucher.status !== "ACTIVE"}
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
                  disabled={isRefunding}
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
            menuData={menuData}
            onBack={() => setShowAddonPicker(false)}
            onSuccess={() => {
              setShowAddonPicker(false);
              onUseNowSuccess();
            }}
          />
        )}
        {showProductDiscountPicker && menuData && (
          <ProductDiscountItemPicker
            voucher={voucher}
            menuData={menuData}
            onBack={() => setShowProductDiscountPicker(false)}
            onSuccess={() => {
              setShowProductDiscountPicker(false);
              onUseNowSuccess();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/** Render either an owned voucher or an exchangeable package detail surface. */
export function VoucherDetailSheet(props: VoucherDetailSheetProps) {
  if (props.packageData !== undefined) {
    return <PackageVoucherDetailSheet {...props} />;
  }

  return <OwnedVoucherDetailSheet {...props} />;
}
