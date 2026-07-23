"use client";

import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { AdminMilkType } from "@/src/lib/types/milkType";
import { formatMoney } from "@/src/utils/pricing";

interface MilkTypeCardProps {
  item: AdminMilkType;
  isFirst: boolean;
  isLast: boolean;
  onClick: (item: AdminMilkType) => void;
  onToggleActive: (id: string, next: boolean) => void;
  onDelete: (item: AdminMilkType) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
}

export default function MilkTypeCard({ 
  item, 
  isFirst, 
  isLast, 
  onClick, 
  onToggleActive, 
  onDelete,
  onReorder 
}: MilkTypeCardProps) {
  return (
    <div
      onClick={() => onClick(item)}
      className={cn(
        "relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition hover:shadow-md cursor-pointer hover:border-primary/30",
        !item.is_active && "opacity-60"
      )}
    >
      <div className="flex flex-col gap-1 p-4 flex-1">
        <div className="flex justify-between items-start mb-1">
          <p className="text-base font-semibold text-foreground line-clamp-1">{item.name}</p>
          {item.is_default && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary shrink-0">
              Mặc định
            </span>
          )}
        </div>
        
        <p className="text-sm font-medium text-primary mt-1">
          {formatMoney(item.price_per_ml)} / ml
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 bg-secondary/10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={item.is_active}
            disabled={item.is_default}
            onClick={(e) => {
              e.stopPropagation();
              if (item.is_default) return;
              onToggleActive(item.id, !item.is_active);
            }}
            title={item.is_default ? "Không thể tắt loại sữa mặc định" : "Bật/tắt trạng thái"}
            className={cn(
              "relative inline-flex h-5 w-9 rounded-full transition disabled:opacity-50",
              item.is_active ? "bg-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5",
                item.is_active ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
          
          <div className="flex gap-1 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReorder(item.id, "up");
              }}
              disabled={isFirst}
              className="p-1 rounded bg-background border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReorder(item.id, "down");
              }}
              disabled={isLast}
              className="p-1 rounded bg-background border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowDown size={14} />
            </button>
          </div>
        </div>

        {!item.is_default && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
            title="Xóa loại sữa"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
