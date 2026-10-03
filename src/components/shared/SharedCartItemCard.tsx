"use client";

import { type ReactNode } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import { line1ItemDetails, line2ItemDetails, addonsDetails } from "@/src/utils/cartHelpers";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import { cn } from "@/src/utils/cn";

interface SharedCartItemCardProps {
  item: ProjectedCartLine;
  menuItem?: MenuItem;
  powders?: Powder[];
  milkTypes: MilkTypeOption[];
  onEdit: () => void;
  onRemove: () => void;
  onDecrease?: () => void;
  onIncrease?: () => void;
  showQuantity?: boolean;
  quantityDisabled?: boolean;
  decreaseDisabled?: boolean;
  editDisabled?: boolean;
  readOnlyReason?: string;
  bundleAllocationBadges?: Array<{ token: string; label: string; quantity: number }>;
  priceRow: ReactNode;
}

/** Render the same cart item presentation for customer, staff, admin and BUNDLE rows. */
export function SharedCartItemCard({
  item, menuItem, powders, milkTypes, onEdit, onRemove, onDecrease, onIncrease,
  showQuantity = true, quantityDisabled = false, decreaseDisabled = false,
  editDisabled = false, readOnlyReason, bundleAllocationBadges = [], priceRow,
}: SharedCartItemCardProps) {
  const unavailable = !menuItem;
  const powderId = item.configuration.size === null ? undefined : item.configuration.powderId;
  const powderName = powders?.find((powder) => powder.id === powderId)?.name;
  const details = [...line1ItemDetails(item, menuItem, milkTypes, powders).slice(1), ...line2ItemDetails(item)];
  const addons = addonsDetails(item);
  return (
    <div
      onClick={(event) => {
        if (unavailable || editDisabled || (event.target as HTMLElement).closest("button")) return;
        onEdit();
      }}
      className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border border-border/50 bg-card p-3 shadow-sm", unavailable ? "bg-muted/50" : "cursor-pointer transition-colors hover:border-border/80")}
    >
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className={cn("relative h-20 w-20 overflow-hidden rounded-xl bg-secondary/40", unavailable && "opacity-60")}>
          {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} fill sizes="80px" className={cn("object-cover", unavailable && "grayscale")} /> : (
            <div className="flex h-full w-full items-center justify-center text-3xl">
              {unavailable ? <AlertTriangle className="h-8 w-8 text-primary" /> : "🍵"}
            </div>
          )}
        </div>
        {!unavailable && showQuantity && (
          <div className="flex items-center gap-2 rounded-full bg-secondary/30 p-1">
            <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={(event) => { event.stopPropagation(); onDecrease?.(); }} disabled={quantityDisabled || decreaseDisabled} aria-label="Giảm số lượng" className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-primary shadow-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30">
              <Minus size={12} />
            </motion.button>
            <span className="w-4 text-center text-xs font-bold text-primary">{item.quantity}</span>
            <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={(event) => { event.stopPropagation(); onIncrease?.(); }} disabled={quantityDisabled} aria-label="Tăng số lượng" className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-primary shadow-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30">
              <Plus size={12} />
            </motion.button>
          </div>
        )}
        {!unavailable && !showQuantity && <span className="text-xs font-bold text-primary">Số lượng: {item.quantity}</span>}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="min-w-0 flex-1 text-sm font-bold leading-tight text-primary">
            <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} disabled={unavailable || editDisabled} title={editDisabled ? readOnlyReason : undefined} aria-label={`Sửa ${item.name}`} className="block min-h-8 w-full truncate rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed">
              {item.name}{item.category === "fusion" && powderName ? ` - ${powderName}` : ""}
            </button>
          </h4>
          <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={(event) => { event.stopPropagation(); onRemove(); }} aria-label={`Xóa ${item.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 size={16} />
          </motion.button>
        </div>
        {unavailable ? (
          <div className="mt-1 space-y-2 text-xs text-primary">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={16} />Món không còn phục vụ</p>
            <p>Vui lòng xóa món này để tiếp tục đặt hàng.</p>
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex flex-wrap gap-1">
              <span className="max-w-full break-words rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">{item.configuration.size ? <SizeLabel size={item.configuration.size} /> : "Add-on"}</span>
              {details.map((detail, index) => <span key={index} className="max-w-full break-words rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">{detail}</span>)}
            </div>
            {addons.length > 0 && <div className="flex flex-wrap gap-1">{addons.map((addon, index) => <span key={index} className="max-w-full break-words rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{addon}</span>)}</div>}
            {item.configuration.note && <span className="w-fit max-w-full break-words rounded bg-primary/5 px-1.5 py-0.5 text-[10px] italic text-primary/80">📝 {item.configuration.note}</span>}
            {bundleAllocationBadges.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Phân bổ ưu đãi BUNDLE">{bundleAllocationBadges.map((badge) => <span key={badge.token} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{badge.label}: {badge.quantity} phần</span>)}</div>}
            {editDisabled && readOnlyReason && <p role="alert" className="text-[10px] font-medium text-primary">{readOnlyReason}</p>}
          </div>
        )}
      </div>
      {!unavailable && <div className="col-span-2">{priceRow}</div>}
    </div>
  );
}
