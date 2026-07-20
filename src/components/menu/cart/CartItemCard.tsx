"use client";

import React, { memo } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2, X, Ticket } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { CartItem } from "@/src/lib/types/cart";
import type { AddonGroup, MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { line1ItemDetails, line2ItemDetails, addonsDetails } from "@/src/utils/cartHelpers";

interface CartItemCardProps {
  item: CartItem;
  menuItem?: MenuItem;
  powderData?: PowderApiResponse;
  milkTypes: MilkTypeOption[];
  addonGroups: AddonGroup[];
  allVouchers: MyVoucher[];
  applicableProductVouchers: MyVoucher[];
  applicableAddonVouchers: MyVoucher[];
  onEdit: (item: CartItem) => void;
  onRemove: (cartId: string) => void;
  onUpdateQuantity: (cartId: string, quantity: number) => void;
  onRemoveProductVoucher: (cartId: string) => void;
  onRemoveAddonVoucher: (cartId: string, voucherId: string) => void;
  onOpenVoucherPicker: (cartId: string) => void;
}

const CartItemCard = ({
  item,
  menuItem,
  powderData,
  milkTypes,
  addonGroups,
  allVouchers,
  applicableProductVouchers,
  applicableAddonVouchers,
  onEdit,
  onRemove,
  onUpdateQuantity,
  onRemoveProductVoucher,
  onRemoveAddonVoucher,
  onOpenVoucherPicker
}: CartItemCardProps) => {
  const hasMoreProductVouchers = !item.productVoucherId && applicableProductVouchers.length > 0;
  const hasMoreAddonVouchers = applicableAddonVouchers.length > 0;
  const hasAvailableVouchers = hasMoreProductVouchers || hasMoreAddonVouchers;
  const hasAnyVoucher = !!item.productVoucherId || (item.addonVouchers && item.addonVouchers.length > 0);

  const line1Chips = line1ItemDetails(item, menuItem, milkTypes, powderData?.data);
  const line2Chips = line2ItemDetails(item, menuItem);
  const addonChips = addonsDetails(item, menuItem, addonGroups, powderData?.data);
  
  const noteText = item.note || null;
  const isUnavailable = !menuItem;

  return (
    <div
      onClick={() => onEdit(item)}
      className={cn(
        "p-3.5 rounded-[1.25rem] bg-white border border-transparent shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] transition-colors flex gap-3.5 cursor-pointer",
        isUnavailable ? "opacity-50 pointer-events-none" : "hover:border-border/60"
      )}
    >
      {/* Thumbnail & Stepper */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="w-[5.5rem] h-[5.5rem] rounded-2xl overflow-hidden bg-secondary/10 relative">
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt={item.name} fill sizes="88px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">🍵</div>
          )}
        </div>
        
        {!hasAnyVoucher && (
          <div 
            className="flex items-center gap-2.5 bg-white border border-border shadow-sm rounded-full px-1.5 py-1 w-full justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => item.quantity <= 1 ? onRemove(item.cartId) : onUpdateQuantity(item.cartId, item.quantity - 1)}
              aria-label="Giảm số lượng"
              className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-primary text-center">
              {item.quantity}
            </span>
            <button
              onClick={() => onUpdateQuantity(item.cartId, item.quantity + 1)}
              aria-label="Tăng số lượng"
              className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        {/* Title + Delete */}
        <div className="flex items-start justify-between w-full">
          <h4 className="font-bold text-sm text-primary leading-tight truncate w-4/5 pr-2">
            {item.name} {item.category === "fusion" && powderData?.data?.find((p: any) => p.id === item.selectedPowderId)?.name && `- ${powderData?.data?.find((p: any) => p.id === item.selectedPowderId)?.name}`}
          </h4>
          <div className="w-1/5 flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.cartId);
              }}
              aria-label={`Xoá ${item.name}`}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-primary/30 hover:text-red-500 hover:bg-red-50 transition-colors -mt-1 -mr-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Customize (full line) */}
        <div className="mt-1.5 flex flex-col gap-1 w-full">
          {line1Chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {line1Chips.map((chip, idx) => (
                <span key={idx} className="text-[11px] font-medium bg-primary/25 text-primary px-2 py-0.5 rounded-full">{chip}</span>
              ))}
            </div>
          )}
          {line2Chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {line2Chips.map((chip, idx) => (
                <span key={idx} className="text-[11px] font-medium bg-primary/20 text-primary/[0.95] px-2 py-0.5 rounded-full">{chip}</span>
              ))}
            </div>
          )}
          {addonChips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {addonChips.map((chip, idx) => (
                <span key={idx} className="text-[11px] font-medium bg-primary/15 text-primary/90 px-2 py-0.5 rounded-full">{chip}</span>
              ))}
            </div>
          )}
          {noteText && (
            <span className="text-[11px] font-medium bg-primary/5 text-primary/80 px-2 py-0.5 rounded-full italic inline-block">📝 {noteText}</span>
          )}
        </div>

        {/* Voucher tags / CTA and Price at the bottom */}
        <div className="flex items-end justify-between mt-3 gap-2 w-full">
          {/* Vouchers (Left side) */}
          <div className="flex flex-wrap gap-1.5 flex-1">
            {/* Applied: product voucher */}
            {item.productVoucherId && (() => {
              const pv = allVouchers.find(v => v.id === item.productVoucherId);
              return (
                <div className="text-[10px] font-bold bg-orange-50 border border-orange-200 text-orange-700 pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                  <Ticket className="w-3 h-3 text-orange-500" /> {pv?.package?.name || "Free món"}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveProductVoucher(item.cartId); }}
                    aria-label="Bỏ voucher sản phẩm"
                    className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-orange-200 text-orange-500 hover:text-orange-700 transition-colors ml-0.5"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              );
            })()}
            {/* Applied: addon vouchers */}
            {item.addonVouchers && item.addonVouchers.map(av => {
              const voucherInfo = allVouchers.find(v => v.id === av.voucherId);
              return (
                <div key={av.voucherId} className="text-[10px] font-bold bg-green-50 border border-green-200 text-green-700 pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                  <Ticket className="w-3 h-3 text-green-600" /> Free {voucherInfo?.addonOption?.label || "Topping"}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveAddonVoucher(item.cartId, av.voucherId); }}
                    aria-label="Bỏ voucher topping"
                    className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-green-200 text-green-600 hover:text-green-800 transition-colors ml-0.5"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              );
            })}
            {/* Available vouchers CTA */}
            {hasAvailableVouchers && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenVoucherPicker(item.cartId); }}
                className="text-[10px] font-bold bg-white border border-dashed border-orange-300 text-orange-600 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-orange-50 hover:border-solid transition-all shadow-sm"
              >
                <Ticket className="w-3 h-3" />
                Chọn ưu đãi ({applicableProductVouchers.length + applicableAddonVouchers.length})
              </button>
            )}
          </div>

          {/* Price (Right side) */}
          <div className="flex items-center gap-1.5 shrink-0 justify-end">
            {item.originalClientPriceVnd > item.clientPriceVnd && (
              <span className="text-[12px] line-through text-primary/30 font-medium">
                {(item.originalClientPriceVnd * item.quantity) / 1000} ká
              </span>
            )}
            <span className="font-bold text-[15px] text-primary">
              {(item.clientPriceVnd * item.quantity) / 1000} ká
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(CartItemCard, (prev, next) => {
  if (prev.item !== next.item) return false;
  if (prev.applicableProductVouchers.length !== next.applicableProductVouchers.length) return false;
  if (prev.applicableAddonVouchers.length !== next.applicableAddonVouchers.length) return false;
  return true;
});
