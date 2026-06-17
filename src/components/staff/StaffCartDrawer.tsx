"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, User, UserX, Ticket, ArrowLeft, CheckCircle2, ChevronRight, X } from "lucide-react";
import type { CartItem } from "@/src/lib/types/cart";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { CustomerInfo } from "./CustomerSelectModal";
import type { MyVoucher } from "@/src/services/staffVoucherService";
import { cn } from "@/src/utils/cn";
import {
  buildProductVoucherMap,
  buildAddonVoucherMap,
  estimateProductSavings,
  estimateMultiDiscountSavings,
  filterUsableVouchers,
} from "@/src/utils/voucherMatchUtils";
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import { line1ItemDetails, line2ItemDetails, addonsDetails } from "@/src/utils/cartHelpers";

// ── Constants ────────────────────────────────────────────────────────────────

const SWEETNESS_LABEL: Record<SweetnessLevel, string> = {
  NONE: "Lạt",
  QUARTER: "Ít ngọt",
  HALF: "Vừa",
  THREE_QUARTER: "Ngọt",
  FULL: "Rất ngọt",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface StaffCartDrawerProps {
  isOpen: boolean;
  cart: CartItem[];
  discountVoucher: {
    discount_type: "PERCENT" | "FIXED";
    discount_value: number;
  } | null;
  customerInfo: CustomerInfo | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onRemove: (cartId: string) => void;
  onEditItem?: (item: CartItem) => void;
  onChangeQuantity: (cartId: string, newQty: number) => void;
  onCheckout: () => void;
  onOpenCustomerSelect: () => void;
  onClearCustomer: () => void;

  customerVouchers?: MyVoucher[];
  selectedDiscountIds?: string[];
  onToggleDiscount?: (voucherId: string) => void;
  onApplyProduct?: (cartId: string, voucher: MyVoucher) => void;
  onRemoveProduct?: (cartId: string) => void;
  onApplyAddon?: (cartId: string, voucher: MyVoucher) => void;
  onRemoveAddon?: (cartId: string, voucherId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function discountLabel(v: MyVoucher): string {
  if (v.discount_type === "PERCENT") return `Giảm ${v.discount_value}%`;
  if (v.discount_type === "FIXED") return `Giảm 🐟 ${(v.discount_value ?? 0) / 1000} cá`;
  return v.package.name;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StaffCartDrawer({
  isOpen,
  cart,
  discountVoucher,
  customerInfo,
  isSubmitting,
  onClose,
  onRemove,
  onEditItem,
  onChangeQuantity,
  onCheckout,
  onOpenCustomerSelect,
  onClearCustomer,
  customerVouchers = [],
  selectedDiscountIds = [],
  onToggleDiscount,
  onApplyProduct,
  onRemoveProduct,
  onApplyAddon,
  onRemoveAddon,
}: StaffCartDrawerProps) {
  const { data: menuData } = useQuery({ queryKey: ["staff", "menu"], queryFn: fetchMenu });
  const { data: powderData } = useQuery({ queryKey: ["staff", "powders"], queryFn: fetchPowders });
  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion] : [];

  const [activeItemForVoucher, setActiveItemForVoucher] = useState<string | null>(null);
  const [isDiscountPickerOpen, setIsDiscountPickerOpen] = useState(false);

  // --- Pull-to-dismiss logic ---
  const y = useMotionValue<number | string>(0);
  const scale = useTransform(y, (latest) => {
    if (typeof latest === "string") return 1;
    if (latest < 0) return 1;
    if (latest > 300) return 0.9;
    return 1 - (latest / 300) * 0.1;
  });
  const dragControls = useDragControls();

  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!contentRef.current) return;
    const scrollTop = contentRef.current.scrollTop;
    const currentY = e.touches[0].clientY;

    if (scrollTop <= 0) {
      if (!isPulling.current) {
        touchStartY.current = currentY;
        isPulling.current = true;
      }
      const deltaY = currentY - touchStartY.current;
      if (deltaY > 0) {
        y.set(deltaY);
      } else {
        y.set(0);
      }
    } else {
      isPulling.current = false;
      if (typeof y.get() === "number" && (y.get() as number) > 0) y.set(0);
    }
  };

  const handleTouchEnd = () => {
    isPulling.current = false;
    if (typeof y.get() === "number" && (y.get() as number) > 100) {
      onClose();
    } else if (typeof y.get() === "number" && (y.get() as number) > 0) {
      animate(y, 0, { type: "spring", stiffness: 300, damping: 28 });
    }
  };

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setActiveItemForVoucher(null);
        setIsDiscountPickerOpen(false);
        y.set(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Subtotal (already reflects PRODUCT voucher credit if applied)
  const subtotalPrice = cart.reduce((s, c) => s + c.clientPriceVnd * c.quantity, 0);

  // Vouchers
  const discountVouchers = filterUsableVouchers(customerVouchers, "DISCOUNT");
  const applicableProductVouchers = buildProductVoucherMap(customerVouchers, cart);
  const applicableAddonVouchersMap = buildAddonVoucherMap(customerVouchers, cart);

  // Discounts
  const selectedDiscountVouchersList = discountVouchers.filter(v => selectedDiscountIds.includes(v.id));
  const listDiscount = estimateMultiDiscountSavings(selectedDiscountVouchersList, subtotalPrice);
  
  const scanDiscount = discountVoucher
    ? discountVoucher.discount_type === "PERCENT"
      ? Math.floor((subtotalPrice * discountVoucher.discount_value) / 100)
      : discountVoucher.discount_value
    : 0;

  const rawDiscountAmount = listDiscount || scanDiscount;

  // Apply rounding rules to match Customer Cart
  const subtotalK = Math.ceil(subtotalPrice / 1000);
  const discountK = Math.floor(rawDiscountAmount / 1000); // Conservative discount display
  const finalK = Math.max(0, subtotalK - discountK);

  const discountAmount = discountK * 1000;
  const total = finalK * 1000;

  const activeItem = cart.find(i => i.cartId === activeItemForVoucher);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40" onClick={onClose} 
          />
          
          <motion.div 
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ y, scale, touchAction: "pan-y" }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 300) {
                onClose();
              }
            }}
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Mobile Drag Handle */}
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="flex justify-center pt-3 pb-1 w-full shrink-0 touch-none"
            >
              <div className="w-12 h-1.5 bg-border rounded-full" />
            </div>

            {/* Header */}
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="flex items-center justify-between px-4 pt-2 pb-3 shrink-0 border-b border-border/40 touch-none"
            >
              <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                Giỏ hàng <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{cart.reduce((sum, c) => sum + c.quantity, 0)}</span>
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center hover:bg-secondary transition"
              >
                <X size={16} />
              </button>
            </div>

        {/* Customer Section */}
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
                    ? (customerInfo.type === "existing" ? `${customerInfo.data.phone_number} • 🐟 ${customerInfo.data.points_balance}` : customerInfo.phone_number)
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
          ref={contentRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 space-y-4"
        >
          {cart.length === 0 ? (
             <div className="text-center py-10 text-muted-foreground space-y-3">
               <span className="text-5xl block">🛒</span>
               <p className="font-medium text-sm">Giỏ hàng đang trống</p>
             </div>
          ) : (
            cart.map((c) => {
              const productVouchersForItem = applicableProductVouchers.get(c.menuItemId) || [];
              const addonVouchersForItem = applicableAddonVouchersMap.get(c.cartId) || [];
              const hasMoreProductVouchers = !c.productVoucherId && productVouchersForItem.length > 0;
              const hasMoreAddonVouchers = addonVouchersForItem.length > 0;
              const hasAvailableVouchers = hasMoreProductVouchers || hasMoreAddonVouchers;
              
              const appliedProductVoucherId = c.productVoucherId;
              const appliedAddonVouchers = c.addonVouchers ?? [];

              const menuItem = menuItems.find(m => m.id === c.menuItemId);
              const line1Chips = line1ItemDetails(c, menuItem, powderData?.data);
              const line2Chips = line2ItemDetails(c, menuItem);
              const addonChips = addonsDetails(c, menuItem, powderData?.data);
              
              const noteText = c.note || null;

              return (
                <div 
                  key={c.cartId} 
                  onClick={() => onEditItem?.(c)}
                  className={cn(
                    "bg-white dark:bg-secondary/20 rounded-2xl p-3.5 flex gap-3 shadow-sm border border-border/50 transition-colors cursor-pointer hover:border-border/80",
                    !menuItem && "opacity-50 pointer-events-none"
                  )}
                >
                  {/* Thumbnail & Stepper */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-secondary/40 flex items-center justify-center text-3xl">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        "🍵"
                      )}
                    </div>
                    {/* Stepper */}
                    <div 
                      className="flex items-center gap-1.5 bg-secondary/30 rounded-full px-1.5 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onChangeQuantity(c.cartId, c.quantity - 1)}
                        disabled={c.quantity <= 1 || !!appliedProductVoucherId}
                        className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-[10px] shadow-sm disabled:opacity-30"
                      >
                        −
                      </motion.button>
                      <span className="text-xs font-bold w-4 text-center">{c.quantity}</span>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onChangeQuantity(c.cartId, c.quantity + 1)}
                        disabled={!!appliedProductVoucherId}
                        className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-[10px] shadow-sm disabled:opacity-30"
                      >
                        +
                      </motion.button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-sm leading-tight text-primary truncate w-4/5 pr-2">
                        {c.name} {c.category === "fusion" && powderData?.data?.find(p => p.id === c.selectedPowderId)?.name && `- ${powderData?.data?.find(p => p.id === c.selectedPowderId)?.name}`}
                      </h4>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onRemove(c.cartId); }} 
                        className="text-muted-foreground hover:text-red-500 transition shrink-0 p-1 w-1/5 flex justify-end"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Customize (full line) */}
                    <div className="mt-1.5 flex flex-col gap-1 w-full">
                      {/* Line 1 — Size + Milk/Powder */}
                      {line1Chips.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {line1Chips.map((chip, idx) => (
                            <span key={idx} className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">{chip}</span>
                          ))}
                        </div>
                      )}
                      {/* Line 2 — Sweetness + Ice + Coldwhisk */}
                      {line2Chips.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {line2Chips.map((chip, idx) => (
                            <span key={idx} className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{chip}</span>
                          ))}
                        </div>
                      )}
                      {/* Line 3 — Addons + Đá dừa + Extra matcha */}
                      {addonChips.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {addonChips.map((chip, idx) => (
                            <span key={idx} className="text-[10px] font-medium bg-secondary text-secondary-foreground/90 px-1.5 py-0.5 rounded">{chip}</span>
                          ))}
                        </div>
                      )}
                      {/* Line 4 — Note */}
                      {noteText && (
                        <span className="text-[10px] font-medium bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded italic inline-block w-fit">📝 {noteText}</span>
                      )}
                    </div>

                    <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                      {/* Vouchers area */}
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {appliedProductVoucherId && (() => {
                          const pv = customerVouchers.find(v => v.id === appliedProductVoucherId);
                          return (
                            <div className="text-[10px] font-bold bg-orange-50 border border-orange-200 text-orange-700 dark:bg-orange-900/30 dark:border-orange-500/30 dark:text-orange-400 pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                              <Ticket size={12} className="text-orange-500" /> {pv?.package?.name || "Free món"}
                              <button onClick={(e) => { e.stopPropagation(); onRemoveProduct!(c.cartId); }} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-orange-200 text-orange-500 hover:text-orange-700 transition-colors ml-0.5"><X size={12} strokeWidth={2.5} /></button>
                            </div>
                          )
                        })()}
                        {appliedAddonVouchers.map((av, idx) => {
                          const voucherInfo = customerVouchers.find(v => v.id === av.voucherId);
                          return (
                            <div key={`${av.voucherId}-${idx}`} className="text-[10px] font-bold bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-500/30 dark:text-green-400 pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                              <Ticket size={12} className="text-green-600" /> Free {voucherInfo?.addonOption?.label || "Topping"}
                              <button onClick={(e) => { e.stopPropagation(); onRemoveAddon!(c.cartId, av.voucherId); }} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-green-200 text-green-600 hover:text-green-800 transition-colors ml-0.5"><X size={12} strokeWidth={2.5} /></button>
                            </div>
                          )
                        })}
                        {hasAvailableVouchers && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveItemForVoucher(c.cartId); setIsDiscountPickerOpen(false); }}
                            className="text-[10px] font-bold bg-white border border-dashed border-orange-300 text-orange-600 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-orange-50 hover:border-solid transition-all shadow-sm"
                          >
                            <Ticket size={12} /> Ưu đãi ({productVouchersForItem.length + addonVouchersForItem.length})
                          </button>
                        )}
                      </div>

                      {/* Price */}
                      <div className="flex flex-col items-end shrink-0">
                        {appliedProductVoucherId && c.originalClientPriceVnd !== c.clientPriceVnd && (
                          <span className="text-[10px] text-muted-foreground line-through">
                            {(c.originalClientPriceVnd * c.quantity) / 1000}k
                          </span>
                        )}
                        <span className="font-bold text-sm text-primary">
                          {(c.clientPriceVnd * c.quantity) / 1000}k
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="px-5 pt-4 pb-6 border-t border-border/50 bg-background/50 backdrop-blur-md shrink-0 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.1)]">
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
                {discountVoucher && !listDiscount && (
                  <div className="flex items-center justify-between bg-green-50/50 border border-green-200/50 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-green-700">🏷 Voucher quét mã</span>
                    <span className="text-xs font-bold text-green-700">-{scanDiscount / 1000}k</span>
                  </div>
                )}
              </div>

              {/* Right Column - Totals */}
              <div className="w-[45%] flex flex-col justify-end gap-1 text-right">
                <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                  <span>Tạm tính</span>
                  <span>{subtotalK}k</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs text-orange-600 font-bold">
                    <span>Giảm</span>
                    <span>-{discountK.toLocaleString('vi-VN')}k</span>
                  </div>
                )}
                <div className="border-t border-dashed border-border/60 my-1" />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Tổng</span>
                  <span className="font-serif text-2xl font-bold text-primary leading-none flex items-center gap-1">
                    <span className="text-xl">🐟</span> {finalK}k
                  </span>
                  {customerInfo && finalK >= 10 && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md mt-1.5">
                      +{Math.floor(total / 10000)} điểm cá
                    </span>
                  )}
                </div>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onCheckout}
              disabled={isSubmitting}
              className="w-full bg-primary text-primary-foreground rounded-2xl h-12 font-bold text-sm shadow-md transition mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  Đang tạo đơn...
                </>
              ) : (
                "Chốt đơn"
              )}
            </motion.button>
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

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Item context */}
                <div className="flex items-center gap-3 p-3 bg-secondary/20 border border-border/50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-secondary/40">
                     {activeItem.imageUrl ? <img src={activeItem.imageUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xl">🍵</div>}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{activeItem.name}</p>
                    <p className="text-xs text-muted-foreground">Size {activeItem.size}</p>
                  </div>
                </div>

                {/* PRODUCT Vouchers */}
                {(applicableProductVouchers.get(activeItem.menuItemId)?.length ?? 0) > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Miễn phí món</p>
                    <div className="space-y-2">
                      {applicableProductVouchers.get(activeItem.menuItemId)?.map(v => {
                        const savings = estimateProductSavings(v, activeItem.originalClientPriceVnd);
                        const isSelected = activeItem.productVoucherId === v.id;
                        const isAlreadyUsed = cart.some(c => c.cartId !== activeItem.cartId && c.productVoucherId === v.id);
                        
                        return (
                          <button
                            key={v.id}
                            disabled={isAlreadyUsed}
                            onClick={() => {
                              if (isAlreadyUsed) return;
                              if (isSelected) onRemoveProduct(activeItem.cartId);
                              else onApplyProduct(activeItem.cartId, v);
                              setActiveItemForVoucher(null);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors",
                              isSelected ? "bg-orange-50 border-orange-200" : isAlreadyUsed ? "opacity-40 bg-secondary/30 border-transparent cursor-not-allowed" : "bg-card border-border hover:bg-orange-50/30"
                            )}
                          >
                            <div>
                              <p className="font-bold text-sm flex items-center gap-2">
                                <Ticket size={14} className="text-orange-500" /> {v.package.name}
                              </p>
                              {savings > 0 && !isAlreadyUsed && (
                                <p className="text-xs text-orange-600 mt-1 font-medium">Giảm {(savings / 1000).toLocaleString('vi-VN')}k</p>
                              )}
                              {isAlreadyUsed && (
                                <p className="text-[10px] text-muted-foreground mt-1 italic">Đã dùng ở ly khác</p>
                              )}
                            </div>
                            {isSelected && <CheckCircle2 size={18} className="text-orange-500" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ADDON Vouchers */}
                {(applicableAddonVouchersMap.get(activeItem.cartId)?.length ?? 0) > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Topping miễn phí</p>
                    <div className="space-y-2">
                      {applicableAddonVouchersMap.get(activeItem.cartId)?.map(v => {
                        const isSelected = (activeItem.addonVouchers ?? []).some(av => av.voucherId === v.id);
                        const isAlreadyUsed = cart.some(c => c.cartId !== activeItem.cartId && c.addonVouchers?.some(av => av.voucherId === v.id));
                        
                        return (
                          <button
                            key={v.id}
                            disabled={isAlreadyUsed}
                            onClick={() => {
                              if (isAlreadyUsed) return;
                              if (isSelected) onRemoveAddon(activeItem.cartId, v.id);
                              else onApplyAddon(activeItem.cartId, v);
                              setActiveItemForVoucher(null);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors",
                              isSelected ? "bg-green-50 border-green-200" : isAlreadyUsed ? "opacity-40 bg-secondary/30 border-transparent cursor-not-allowed" : "bg-card border-border hover:bg-green-50/30"
                            )}
                          >
                            <div>
                              <p className="font-bold text-sm flex items-center gap-2">
                                <Ticket size={14} className="text-green-600" /> Free {v.addonOption?.label || "Topping"}
                              </p>
                              {isAlreadyUsed && (
                                <p className="text-[10px] text-muted-foreground mt-1 italic">Đã dùng ở ly khác</p>
                              )}
                            </div>
                            {isSelected && <CheckCircle2 size={18} className="text-green-600" />}
                          </button>
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

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {discountVouchers.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground mt-10">Không có mã giảm giá nào</p>
                )}
                {discountVouchers.map(v => {
                  const isSelected = selectedDiscountIds.includes(v.id);
                  const hasPercent = selectedDiscountIds.some(id => {
                    const found = discountVouchers.find(dv => dv.id === id);
                    return found?.discount_type === "PERCENT";
                  });
                  // Disable if trying to add a second PERCENT voucher
                  const isDisabled = !isSelected && v.discount_type === "PERCENT" && hasPercent;

                  return (
                    <button
                      key={v.id}
                      onClick={() => !isDisabled && onToggleDiscount(v.id)}
                      disabled={isDisabled}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors",
                        isSelected ? "bg-orange-50 border-orange-200" : isDisabled ? "opacity-50 cursor-not-allowed bg-secondary/30" : "bg-card border-border hover:bg-orange-50/30"
                      )}
                    >
                      <div>
                        <p className="font-bold text-sm text-primary flex items-center gap-2">
                          <Ticket size={14} className="text-orange-500" /> {discountLabel(v)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{v.package.description}</p>
                      </div>
                      <div className="shrink-0 ml-3">
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                          isSelected ? "border-orange-500 bg-orange-500" : "border-muted-foreground"
                        )}>
                          {isSelected && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    </button>
                  );
                })}
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

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
