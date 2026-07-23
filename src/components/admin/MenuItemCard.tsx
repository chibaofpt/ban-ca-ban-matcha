"use client";

import Image from 'next/image';
import { cn } from "@/src/utils/cn";
import type { AdminMenuItem } from "@/src/lib/types/menu";

interface MenuItemCardProps {
  item: AdminMenuItem;
  onClick: (item: AdminMenuItem) => void;
  onToggleAvailable: (id: string, next: boolean) => void;
}

/** Card hiển thị 1 menu item trong trang admin. */
export default function MenuItemCard({
  item,
  onClick,
  onToggleAvailable,
}: MenuItemCardProps) {
  // Price range — min price among sizes that have a non-null base_price_vnd
  return (
    <div
      onClick={() => onClick(item)}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md cursor-pointer hover:border-primary/40 hover:-translate-y-0.5",
        !item.is_available && "opacity-60 grayscale-[0.3]"
      )}
    >
      {/* Image */}
      <div className="relative h-40 bg-secondary/30 flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            quality={60}
          />
        ) : (
          <span className="text-4xl select-none opacity-50 group-hover:scale-110 transition-transform duration-500">🍵</span>
        )}

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border",
              item.category === "latte"
                ? "bg-emerald-500/20 text-emerald-800 border-emerald-500/30"
                : "bg-violet-500/20 text-violet-800 border-violet-500/30"
            )}
          >
            {item.category}
          </span>
          {item.is_seasonal && (
            <span className="rounded-full bg-amber-500/20 text-amber-800 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
              Mùa vụ
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5 p-4 flex-1">
        <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Footer — toggle only */}
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5 bg-secondary/5">
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
          {item.is_available ? "Đang bán" : "Tạm ẩn"}
        </span>
        {/* Availability toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={item.is_available}
          aria-label={item.is_available ? "Đang bán — bấm để tạm ẩn" : "Đang ẩn — bấm để mở bán"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAvailable(item.id, !item.is_available);
          }}
          className={cn(
            "relative inline-flex h-5 w-9 rounded-full transition-colors duration-200",
            item.is_available ? "bg-primary" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 m-0.5",
              item.is_available ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>
    </div>
  );
}
