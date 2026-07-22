"use client";

import { cn } from "@/src/utils/cn";
import type { Powder } from "@/src/lib/types/powder";

interface PowderCardProps {
  item: Powder;
  onClick: (item: Powder) => void;
  onToggleAvailable: (id: string, next: boolean) => void;
}

const TYPE_COLORS: Record<string, string> = {
  RECOMMEND: "bg-blue-100 text-blue-700",
  NEW: "bg-emerald-100 text-emerald-700",
  SEASONAL: "bg-amber-100 text-amber-700",
  NONE: "bg-secondary text-muted-foreground",
};

export default function PowderCard({ item, onClick, onToggleAvailable }: PowderCardProps) {
  return (
    <div
      onClick={() => onClick(item)}
      className={cn(
        "relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition hover:shadow-md cursor-pointer hover:border-primary/30",
        !item.is_available && "opacity-60"
      )}
    >
      <div className="flex flex-col gap-1 p-4 flex-1">
        <div className="flex justify-between items-start mb-1">
          <p className="text-base font-semibold text-foreground line-clamp-1">{item.name}</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0",
              TYPE_COLORS[item.type] || TYPE_COLORS.NONE
            )}
          >
            {item.type}
          </span>
        </div>
        
        {item.manufacturer && (
          <p className="text-xs text-muted-foreground">Hãng: {item.manufacturer}</p>
        )}
        
        <p className="text-sm font-medium text-primary mt-2">
          {item.price_per_gram.toLocaleString()} đ/g
        </p>

        {/* Radar/Stats overview (simple version) */}
        <div className="flex gap-2 mt-3 text-[10px] text-muted-foreground">
          {item.fragrance && <span>Mùi: {item.fragrance}</span>}
          {item.body && <span>Đậm: {item.body}</span>}
          {item.bitterness && <span>Đắng: {item.bitterness}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 bg-secondary/10">
        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Trạng thái</span>
        <button
          type="button"
          role="switch"
          aria-checked={item.is_available}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAvailable(item.id, !item.is_available);
          }}
          className={cn(
            "relative inline-flex h-5 w-9 rounded-full transition",
            item.is_available ? "bg-primary" : "bg-border"
          )}
        >
          <span
            className={cn(
              "block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5",
              item.is_available ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>
    </div>
  );
}
