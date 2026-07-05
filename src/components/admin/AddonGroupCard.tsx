"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/src/utils/cn";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { formatMoney } from "@/src/utils/pricing";

interface AddonGroupCardProps {
  item: AdminAddonGroup;
  onEdit: (item: AdminAddonGroup) => void;
  onToggleActive: (id: string, next: boolean) => void;
  onDelete: (item: AdminAddonGroup) => void;
}

const TYPE_COLORS = {
  SELECTOR: "bg-blue-100 text-blue-700 border-blue-200",
  TOGGLE: "bg-amber-100 text-amber-700 border-amber-200",
  QUANTITY: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function AddonGroupCard({
  item,
  onEdit,
  onToggleActive,
  onDelete,
}: AddonGroupCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card overflow-hidden shadow-sm transition",
        !item.is_active && "opacity-60"
      )}
    >
      {/* Header / Collapsed State */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 cursor-pointer hover:bg-secondary/20 transition"
      >
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground text-base">{item.name}</h3>
            
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border",
                TYPE_COLORS[item.type]
              )}
            >
              {item.type}
            </span>

            {item.is_required && (
              <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-bold tracking-wider uppercase">
                Bắt buộc
              </span>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground flex items-center gap-3">
            <span>{item.options.length} options</span>
            {item.description && (
              <>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span className="line-clamp-1">{item.description}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 sm:gap-4 ml-auto">
          <button
            type="button"
            role="switch"
            aria-checked={item.is_active}
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive(item.id, !item.is_active);
            }}
            className={cn(
              "relative inline-flex h-5 w-9 rounded-full transition shrink-0",
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
          
          <div className="w-px h-5 bg-border shrink-0" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="p-2 text-muted-foreground hover:text-primary transition bg-secondary/30 rounded-lg hover:bg-primary/10"
            title="Sửa nhóm"
          >
            <Pencil size={16} />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="p-2 text-muted-foreground hover:text-destructive transition bg-secondary/30 rounded-lg hover:bg-destructive/10"
            title="Xóa nhóm"
          >
            <Trash2 size={16} />
          </button>

          <ChevronDown
            size={20}
            className={cn(
              "text-muted-foreground transition-transform duration-200 shrink-0",
              expanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded State (Options list) */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="p-4 pt-0 border-t border-border/50 bg-secondary/10">
            {item.options.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nhóm này chưa có option nào.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {item.options.map((opt) => (
                  <div key={opt.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-medium text-foreground leading-tight">
                        {opt.label}
                      </span>
                      {opt.is_default && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary uppercase">
                          Mặc định
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-end justify-between mt-auto pt-1">
                      <span className="text-sm font-semibold text-primary">
                        {opt.price_vnd > 0 ? `+${formatMoney(opt.price_vnd)}` : "Miễn phí"}
                      </span>
                      {opt.gram_value !== null && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          {opt.gram_value > 0 ? `+${opt.gram_value}g` : `${opt.gram_value}g`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
