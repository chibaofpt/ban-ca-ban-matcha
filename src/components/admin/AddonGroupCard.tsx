"use client";

import Image from "next/image";
import { Eye, EyeOff, ImageIcon, Pencil, Plus } from "lucide-react";
import AddonOptionRow from "@/src/components/admin/AddonOptionRow";
import ReorderButtons from "@/src/components/admin/ReorderButtons";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { cn } from "@/src/utils/cn";

interface AddonGroupCardProps {
  item: AdminAddonGroup;
  isFirst: boolean;
  isLast: boolean;
  busyKey: string | null;
  isHighlighted: boolean;
  highlightedOptionId: string | null;
  reorderBusy: boolean;
  pendingGroupDirection: "up" | "down" | null;
  pendingOption: { optionId: string; direction: "up" | "down" } | null;
  onEditGroup: () => void;
  onToggleGroup: (next: boolean) => void;
  onReorderGroup: (direction: "up" | "down") => void;
  onCreateOption: () => void;
  onEditOption: (optionId: string) => void;
  onToggleOption: (optionId: string, next: boolean) => void;
  onReorderOption: (optionId: string, direction: "up" | "down") => void;
}

/** Display a complete add-on group with its always-visible option list. */
export default function AddonGroupCard({
  item,
  isFirst,
  isLast,
  busyKey,
  isHighlighted,
  highlightedOptionId,
  reorderBusy,
  pendingGroupDirection,
  pendingOption,
  onEditGroup,
  onToggleGroup,
  onReorderGroup,
  onCreateOption,
  onEditOption,
  onToggleOption,
  onReorderOption,
}: AddonGroupCardProps) {
  const activeOptionCount = item.options.filter((option) => option.is_active).length;
  const isGroupBusy = busyKey === `group:${item.id}` || busyKey === `group-toggle:${item.id}` || pendingGroupDirection !== null;

  return (
    <article
      id={`addon-group-${item.id}`}
      className={cn(
        "scroll-mt-40 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[background-color,box-shadow,border-color] duration-300",
        !item.is_active && "border-dashed bg-muted/40",
        isHighlighted && "border-primary/60 bg-primary/5 ring-2 ring-primary/30",
      )}
    >
      <header className="flex flex-wrap items-start gap-3 bg-primary p-3 text-primary-foreground sm:p-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary-foreground/30 bg-primary-foreground/10 sm:h-16 sm:w-16", !item.is_active && "opacity-60")}>
          {item.image_url ? (
            <Image src={item.image_url} alt={`Ảnh ${item.name}`} width={64} height={64} sizes="64px" quality={65} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-primary-foreground/75" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-[8rem] flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="max-w-full truncate text-base font-semibold text-primary-foreground">{item.name}</h2>
            <span className="flex h-6 shrink-0 items-center rounded-sm border border-primary-foreground/25 bg-primary-foreground/15 px-2 text-[11px] font-medium text-primary-foreground">
              {item.is_dynamic_gram ? "Theo gram bột" : "Giá cố định"}
            </span>
            <span className="flex h-6 shrink-0 items-center rounded-sm border border-primary-foreground/25 bg-primary-foreground/15 px-2 text-[11px] font-medium text-primary-foreground">Tối đa {item.max_select}</span>
            {!item.is_active ? <span className="flex h-6 shrink-0 items-center rounded-sm border border-dashed border-primary-foreground/50 bg-primary-foreground/10 px-2 text-[11px] font-medium text-primary-foreground">Đã ẩn</span> : null}
          </div>
        </div>

        <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:pl-[4.75rem]">
          <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-primary-foreground/80">
            <span className="shrink-0">{activeOptionCount}/{item.options.length} option hiển thị</span>
            {item.description ? <><span aria-hidden="true">·</span><p className="truncate">{item.description}</p></> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              id={`edit-group-${item.id}`}
              type="button"
              onClick={onEditGroup}
              disabled={isGroupBusy}
              className="flex h-10 w-10 items-center justify-center rounded-md text-primary-foreground transition active:scale-95 hover:bg-primary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground disabled:opacity-40"
              aria-label={`Sửa nhóm ${item.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={item.is_active ? `Ẩn nhóm ${item.name}` : `Hiện nhóm ${item.name}`}
              onClick={() => onToggleGroup(!item.is_active)}
              disabled={isGroupBusy}
              className="flex h-10 w-10 items-center justify-center rounded-md text-primary-foreground transition active:scale-95 hover:bg-primary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground disabled:opacity-40"
            >
              {item.is_active ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
            <ReorderButtons
              isFirst={isFirst}
              isLast={isLast}
              busy={reorderBusy}
              pendingDirection={pendingGroupDirection}
              label={`nhóm ${item.name}`}
              onUp={() => onReorderGroup("up")}
              onDown={() => onReorderGroup("down")}
              tone="on-primary"
              dense
            />
          </div>
        </div>
      </header>

      <section className="border-t border-border/60 bg-secondary/10 p-3 sm:p-4" aria-label={`Options của ${item.name}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">Add-on options</h3>
          <button type="button" onClick={onCreateOption} className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition active:scale-95 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-4 w-4" />
            Thêm option
          </button>
        </div>

        {item.options.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground">Nhóm này chưa có option.</p>
        ) : (
          <div className="space-y-2">
            {item.options.map((option, index) => (
              <AddonOptionRow
                key={option.id}
                group={item}
                option={option}
                isFirst={index === 0}
                isLast={index === item.options.length - 1}
                isBusy={busyKey === `option:${option.id}` || busyKey === `option-toggle:${option.id}` || pendingOption?.optionId === option.id}
                isHighlighted={highlightedOptionId === option.id}
                reorderBusy={reorderBusy}
                pendingDirection={pendingOption?.optionId === option.id ? pendingOption.direction : null}
                onEdit={() => onEditOption(option.id)}
                onToggle={(next) => onToggleOption(option.id, next)}
                onReorder={(direction) => onReorderOption(option.id, direction)}
              />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
