"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
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
  formatExpiryLabel,
  formatVoucherExpiry,
  VOUCHER_TYPE_CONFIG,
} from "@/src/lib/utils/voucherModalHelpers";
import { cn } from "@/src/utils/cn";
import { AddonItemPicker } from "./AddonItemPicker";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher, VoucherPackage } from "@/src/services/customerVoucherService";
import { ceilTo1000 } from "@/src/utils/pricing";

interface OwnedVoucherDetailSheetProps {
  packageData?: never;
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
}

interface PackageVoucherDetailSheetProps {
  packageData: VoucherPackage;
  voucher?: never;
  points: number;
  isLoggedIn: boolean;
  isExchanging: boolean;
  onBack: () => void;
  onExchange?: (pkg: VoucherPackage) => void;
  onLogin?: (pkg: VoucherPackage) => void;
}

type VoucherDetailSheetProps = OwnedVoucherDetailSheetProps | PackageVoucherDetailSheetProps;

function isPackageVoucherDetail(
  props: VoucherDetailSheetProps,
): props is PackageVoucherDetailSheetProps {
  return props.packageData !== undefined;
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
}: OwnedVoucherDetailSheetProps) => {
  const router = useRouter();
  const { addToCart, loading } = useAddVoucherToCart();
  const { setCartOpen, setSelectedVoucherIds, updateItem, applyAddonVoucher, selectedVoucherIds } = useCartStore();
  const [showAddonPicker, setShowAddonPicker] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(voucher.menu_item_id ?? "");
  const [selectedProductSize, setSelectedProductSize] = useState<"SMALL" | "MEDIUM" | "LARGE" | "">("");
  const productDiscountCombinations = voucher.voucher_type === "PRODUCT_DISCOUNT" && menuData
    ? (voucher.eligible_menu_items?.length ? voucher.eligible_menu_items : voucher.menu_item_id ? [{ menu_item_id: voucher.menu_item_id }] : [])
        .flatMap((target) => [...menuData.latte, ...menuData.fusion].filter((item) => item.id === target.menu_item_id)
          .flatMap((item) => (voucher.eligible_sizes ?? []).filter((size) => item.sizes.some((row) => row.size === size && row.base_price_vnd !== null)).map((size) => ({ menuItemId: item.id, name: item.name, size }))))
    : [];
  const productDiscountReady = voucher.voucher_type !== "PRODUCT_DISCOUNT" ||
    (menuData !== undefined && productDiscountCombinations.length > 0);

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
    if (voucher.voucher_type === "PRODUCT_DISCOUNT" && onSelectProductDiscountTarget) {
      onSelectProductDiscountTarget(voucher);
      return;
    }
    if (!canApply) return;
    if (vType === "PRODUCT" || vType === "PRODUCT_DISCOUNT" || vType === "ITEM") {
      if (voucher.voucher_type === "PRODUCT_DISCOUNT" && !productDiscountReady) return;
      const selection = productDiscountCombinations.length === 1
        ? { menuItemId: productDiscountCombinations[0]!.menuItemId, size: productDiscountCombinations[0]!.size }
        : selectedProductId && selectedProductSize ? { menuItemId: selectedProductId, size: selectedProductSize } : undefined;
      if (voucher.voucher_type === "PRODUCT_DISCOUNT" && productDiscountCombinations.length > 1 && !selection) {
        import("sonner").then((module) => module.toast.error("Vui lòng chọn sản phẩm và size"));
        return;
      }
      const res = selection ? await addToCart(voucher, selection) : await addToCart(voucher);
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
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-white">
        <button
          onClick={onBack}
          aria-label="Quay lại danh sách voucher"
          className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h3 className="font-bold text-primary">Chi tiết ưu đãi</h3>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-6">
        <div className="flex bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="w-24 bg-orange-50 flex flex-col items-center justify-center p-3 border-r border-dashed shrink-0">
            <span className="font-bold text-xl text-orange-600">{highlight.text}</span>
            <span className="text-xs font-medium text-orange-500/80">{highlight.subtext}</span>
          </div>
          <div className="p-4 flex-1">
            <div className="flex justify-between items-start gap-2 mb-2">
              <h4 className="font-bold text-sm text-primary line-clamp-2">{voucher.package.name}</h4>
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap", config.badgeCls)}>
                {config.label}
              </span>
            </div>
            <p className="text-xs text-primary/70">{getVoucherBenefitText(voucher)}</p>
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
            <p className="text-sm text-primary/80">{formatVoucherExpiry(voucher.expires_at)}</p>
          </div>

          {voucher.min_order_vnd != null && voucher.min_order_vnd > 0 && (
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-primary/50 uppercase tracking-widest">Điều kiện</h5>
              <p className="text-sm text-primary/80">Giá trị đơn tối thiểu: {(voucher.min_order_vnd / 1000).toLocaleString("vi-VN")} 🐟</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 bg-white border-t border-border/40 pb-[max(1.25rem,env(safe-area-inset-bottom))] shrink-0">
        {vType === "PRODUCT_DISCOUNT" && productDiscountCombinations.length > 1 ? <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-semibold">Sản phẩm<select value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setSelectedProductSize(""); }} className="h-11 w-full rounded-xl border bg-background px-2 text-sm"><option value="">Chọn món</option>{[...new Map(productDiscountCombinations.map((entry) => [entry.menuItemId, entry])).values()].map((entry) => <option key={entry.menuItemId} value={entry.menuItemId}>{entry.name}</option>)}</select></label>
          <label className="space-y-1 text-xs font-semibold">Size<select value={selectedProductSize} onChange={(event) => setSelectedProductSize(event.target.value as typeof selectedProductSize)} className="h-11 w-full rounded-xl border bg-background px-2 text-sm"><option value="">Chọn size</option>{productDiscountCombinations.filter((entry) => entry.menuItemId === selectedProductId).map((entry) => <option key={entry.size} value={entry.size}>{entry.size}</option>)}</select></label>
        </div> : null}
        {!canApply && disabledReason && (
          <p className="text-center text-xs text-rose-500 mb-3">{disabledReason}</p>
        )}
        {vType === "PRODUCT_DISCOUNT" && !productDiscountReady ? (
          <p className="mb-3 text-center text-xs text-rose-500">{menuData ? "Không còn tổ hợp sản phẩm và size phù hợp" : "Đang tải sản phẩm phù hợp…"}</p>
        ) : null}
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
              onClick={handleUseNow}
              disabled={!canApply || !productDiscountReady || loading || isRefunding || voucher.status !== "ACTIVE"}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                vType === "BUNDLE" ? "Chọn món cho ưu đãi" : "Dùng ngay"
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
      </AnimatePresence>
    </motion.div>
  );
};

function PackageVoucherDetailSheet({
  packageData: pkg,
  points,
  isLoggedIn,
  isExchanging,
  onBack,
  onExchange,
  onLogin,
}: PackageVoucherDetailSheetProps) {
  const config = VOUCHER_TYPE_CONFIG[pkg.voucher_type] ?? VOUCHER_TYPE_CONFIG.DISCOUNT;
  const highlight = getTicketHighlightText(pkg.voucher_type, pkg.discount_type, pkg.discount_value, pkg.reference_size);
  const eligibility = canExchange(pkg, points, pkg.user_redeemed_count ?? 0);
  const deficit = Math.max(0, pkg.points_cost - points);
  let label = pkg.acquisition_mode === "FREE_CLAIM" ? "Nhận miễn phí" : `Đổi ${pkg.points_cost} 🐟`;
  let explanation: string | null = null;
  let disabled = isExchanging;
  if (pkg.acquisition_mode === "AUTO_GRANT") {
    label = "Được cấp tự động";
    explanation = "Ưu đãi này được tự động thêm khi bạn đủ điều kiện.";
    disabled = true;
  } else if (!isLoggedIn) {
    label = "Đăng nhập để nhận ưu đãi";
  } else if (eligibility.reason === "insufficient_points") {
    explanation = `Bạn cần thêm ${deficit} 🐟 để đổi ưu đãi này.`;
    disabled = true;
  } else if (eligibility.reason === "sold_out") {
    explanation = "Gói ưu đãi đã hết số lượng.";
    disabled = true;
  } else if (eligibility.reason === "limit_reached") {
    explanation = "Bạn đã nhận đủ số lượt cho phép của gói này.";
    disabled = true;
  } else if (!onExchange) {
    explanation = "Tạm thời chưa thể thực hiện.";
    disabled = true;
  }
  if (!isLoggedIn && !onLogin) {
    explanation = "Tạm thời chưa thể thực hiện.";
    disabled = true;
  }
  const action = () => (isLoggedIn ? onExchange?.(pkg) : onLogin?.(pkg));
  return (
    <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-white px-5 py-4">
        <button type="button" onClick={onBack} aria-label="Quay lại danh sách voucher" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-5 w-5" /></button>
        <h3 className="font-bold text-primary">Chi tiết ưu đãi</h3>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div className="flex overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed bg-orange-50 p-3"><span className="text-xl font-bold text-orange-600">{highlight.text}</span><span className="text-xs text-orange-500">{highlight.subtext}</span></div>
          <div className="flex-1 p-4"><div className="mb-2 flex justify-between gap-2"><h4 className="text-sm font-bold text-primary">{pkg.name}</h4><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", config.badgeCls)}>{config.label}</span></div><p className="text-xs text-primary/70">{getPackageBenefitText(pkg)}</p></div>
        </div>
        <div className="space-y-4">
          <section><h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Mô tả</h5><p className="whitespace-pre-wrap text-sm text-primary/80">{pkg.description || "Không có mô tả chi tiết."}</p></section>
          <section><h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Hạn sử dụng</h5><p className="text-sm text-primary/80">{formatExpiryLabel(pkg.expires_after_days)}</p></section>
          {pkg.min_order_vnd != null && pkg.min_order_vnd > 0 ? <section><h5 className="text-xs font-bold uppercase tracking-widest text-primary/50">Điều kiện</h5><p className="text-sm text-primary/80">Giá trị đơn tối thiểu: {pkg.min_order_vnd.toLocaleString("vi-VN")}đ</p></section> : null}
        </div>
      </div>
      <div className="shrink-0 border-t bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {explanation ? <p className="mb-3 text-center text-xs text-rose-500">{explanation}</p> : null}
        <button type="button" onClick={action} disabled={disabled} aria-busy={isExchanging} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{isExchanging ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{label}</button>
      </div>
    </motion.div>
  );
}

/** Render an owned voucher or a catalog package without fabricating cross-mode data. */
export function VoucherDetailSheet(props: VoucherDetailSheetProps) {
  return isPackageVoucherDetail(props)
    ? <PackageVoucherDetailSheet {...props} />
    : <OwnedVoucherDetailSheet {...props} />;
}
