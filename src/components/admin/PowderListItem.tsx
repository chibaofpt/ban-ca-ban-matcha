"use client";

import { cn } from "@/src/utils/cn";
import type { Powder } from "@/src/lib/types/powder";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

interface PowderListItemProps {
  item: Powder;
  onClick: (item: Powder) => void;
}

const TYPE_LABEL: Record<string, string> = {
  RECOMMEND: "Recommend",
  NEW: "New",
  SEASONAL: "Seasonal",
  NONE: "",
};

const TYPE_COLORS: Record<string, string> = {
  RECOMMEND: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  NEW: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  SEASONAL: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  NONE: "",
};

/** Một dòng trong danh sách bột — nhấp vào để mở bottom sheet. */
export default function PowderListItem({ item, onClick }: PowderListItemProps) {
  const hasBadge = item.type !== "NONE";

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left",
        "hover:bg-secondary/40 active:bg-secondary/60 transition-colors",
        "border-b border-border/50 last:border-b-0"
      )}
    >
      <div className="shrink-0 w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center overflow-hidden border border-border/40">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={`Ảnh ${item.name}`}
            width={40}
            height={40}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {/* Nội dung chính */}
      <div className="flex-1 min-w-0">
        {/* Dòng 1: tên + badge + giá */}
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate flex-1">
            {item.name}
          </p>
          {hasBadge && (
            <span
              className={cn(
                "shrink-0 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border",
                TYPE_COLORS[item.type]
              )}
            >
              {TYPE_LABEL[item.type]}
            </span>
          )}
          <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">
            {item.price_per_gram.toLocaleString("vi-VN")}đ/g
          </span>
        </div>

        {/* Dòng 2: NSX · mô tả + gram tồn (placeholder) */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">
            {[item.manufacturer, item.description]
              .filter(Boolean)
              .join(" · ") || <span className="italic opacity-50">Chưa có mô tả</span>}
          </p>
          {/* Gram tồn kho — placeholder cho field inventory sau */}
          <span className="shrink-0 text-[10px] text-muted-foreground/60 font-mono">
            — g
          </span>
        </div>
      </div>

      {/* Chevron gợi ý có thể bấm */}
      <svg
        className="shrink-0 w-4 h-4 text-muted-foreground/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
