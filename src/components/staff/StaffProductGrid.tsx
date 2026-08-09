"use client";

import React, { memo } from "react";
import Image from "next/image";
import type { MenuItem } from "@/src/lib/types/menu";

const SIZE_CARD_LABELS: Record<string, string> = {
  S: "Nhỏ",
  M: "Vừa",
  L: "Lớn",
  XL: "Khổng lồ"
};

interface StaffProductGridProps {
  items: MenuItem[];
  onItemClick: (item: MenuItem) => void;
  getDisplayPrice: (item: MenuItem, sizeObj: MenuItem["sizes"][0]) => number;
}

export const StaffProductGrid = memo(function StaffProductGrid({
  items,
  onItemClick,
  getDisplayPrice
}: StaffProductGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center col-span-full">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl">🍵</span>
        </div>
        <p className="text-muted-foreground font-medium">Không tìm thấy sản phẩm</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-5 pb-24">
      {items.map((item) => {
        return (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className="bg-card hover:bg-accent/5 transition-colors border border-border/40 hover:border-primary/20 rounded-2xl p-3 flex flex-col text-left group overflow-hidden relative shadow-sm"
          >
            {/* Image */}
            <div className="w-full aspect-square bg-muted/30 rounded-xl overflow-hidden mb-3 relative group-hover:scale-[1.02] transition-transform">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/5">
                  <span className="text-3xl opacity-20">🐟</span>
                </div>
              )}

            </div>

            <h3 className="font-bold text-sm text-primary mb-1 line-clamp-2 leading-tight">
              {item.name}
            </h3>

            {/* Size prices row */}
            <div className="mt-auto pt-2 border-t border-border/50 w-full">
              <div className="flex items-end justify-between gap-1">
                {item.sizes.filter((s) => s.base_price_vnd != null).map((s) => (
                  <div key={s.size} className="flex flex-col items-center gap-0.5 flex-1">
                    <span className="text-[8px] font-bold text-primary/50 uppercase tracking-wide whitespace-nowrap">
                      {SIZE_CARD_LABELS[s.size] ?? s.size}
                    </span>
                    <span className="text-[11px] font-bold text-primary">
                      {getDisplayPrice(item, s) / 1000}k
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
});
