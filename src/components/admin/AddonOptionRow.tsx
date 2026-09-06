"use client";

import Image from "next/image";
import { Eye, EyeOff, ImageIcon, Pencil } from "lucide-react";
import ReorderButtons from "@/src/components/admin/ReorderButtons";
import type { AdminAddonGroup, AdminAddonOption } from "@/src/lib/types/addonGroup";
import { formatMoney } from "@/src/utils/pricing";
import { cn } from "@/src/utils/cn";

interface AddonOptionRowProps {
  group: AdminAddonGroup;
  option: AdminAddonOption;
  isFirst: boolean;
  isLast: boolean;
  isBusy: boolean;
  isHighlighted: boolean;
  reorderBusy: boolean;
  pendingDirection: "up" | "down" | null;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
  onReorder: (direction: "up" | "down") => void;
}

/** Render one compact add-on option row. */
export default function AddonOptionRow({
  group,
  option,
  isFirst,
  isLast,
  isBusy,
  isHighlighted,
  reorderBusy,
  pendingDirection,
  onEdit,
  onToggle,
  onReorder,
}: AddonOptionRowProps) {
  return (
    <div
      id={`addon-option-${option.id}`}
      className={cn(
        "scroll-mt-40 overflow-hidden rounded-xl border border-border bg-card transition-[background-color,box-shadow,border-color] duration-300",
        !option.is_active && "border-dashed bg-muted/40",
        isHighlighted && "border-primary/60 bg-primary/5 ring-2 ring-primary/30",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-2.5 sm:px-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-secondary/30", !option.is_active && "opacity-60")}>
          {option.image_url ? (
            <Image src={option.image_url} alt={`Ảnh ${option.label}`} width={44} height={44} sizes="44px" quality={60} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{option.label}</p>
            {!option.is_active ? <span className="flex h-6 shrink-0 items-center rounded-sm border border-dashed border-border bg-muted px-2 text-[11px] font-medium text-muted-foreground">Đã ẩn</span> : null}
          </div>
          <p className="mt-0.5 text-xs font-medium text-primary">
            {group.is_dynamic_gram
              ? option.gram_value !== null ? `+${option.gram_value}g` : "Chưa có gram"
              : option.price_vnd > 0 ? `+${formatMoney(option.price_vnd)}` : "Miễn phí"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            id={`edit-option-${option.id}`}
            type="button"
            onClick={onEdit}
            disabled={isBusy}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition active:scale-95 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            aria-label={`Sửa ${option.label}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={option.is_active ? `Ẩn option ${option.label}` : `Hiện option ${option.label}`}
            onClick={() => onToggle(!option.is_active)}
            disabled={isBusy}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition active:scale-95 hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            {option.is_active ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
          <ReorderButtons
            isFirst={isFirst}
            isLast={isLast}
            busy={reorderBusy}
            pendingDirection={pendingDirection}
            label={`option ${option.label}`}
            onUp={() => onReorder("up")}
            onDown={() => onReorder("down")}
            dense
          />
        </div>
      </div>
    </div>
  );
}
