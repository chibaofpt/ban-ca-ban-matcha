"use client";

import Image from "next/image";
import { GripVertical, ImageIcon } from "lucide-react";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import type { PointerEvent } from "react";
import type { AdminMenuItem, Category } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";

type ReorderFilter = "active" | "all";

interface MenuReorderPanelProps {
  groups: Record<Category, AdminMenuItem[]>;
  filter: ReorderFilter;
  disabled: boolean;
  onFilterChange: (filter: ReorderFilter) => void;
  onReorder: (category: Category, visibleItems: AdminMenuItem[]) => void;
  onMove: (category: Category, itemId: string, beforeId: string | null) => void;
}

const SECTIONS: Array<{ category: Category; label: string }> = [
  { category: "latte", label: "Latte" },
  { category: "fusion", label: "Fusion" },
  { category: "extras", label: "Add-on" },
];

function DraggableMenuRow({
  item,
  peers,
  disabled,
  onMove,
}: {
  item: AdminMenuItem;
  peers: AdminMenuItem[];
  disabled: boolean;
  onMove: (beforeId: string | null) => void;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();

  const startDragging = (event: PointerEvent<HTMLButtonElement>) => {
    if (!disabled) controls.start(event);
  };

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      layout={reduceMotion ? undefined : "position"}
      whileDrag={{ scale: 1.015, boxShadow: "0 12px 30px rgb(0 0 0 / 0.14)" }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-2 py-2 shadow-sm"
    >
      <button
        type="button"
        aria-label={`Kéo để đổi vị trí ${item.name}`}
        disabled={disabled}
        onPointerDown={startDragging}
        className="flex h-11 w-11 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground transition active:cursor-grabbing hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-50"
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-secondary/30">
        {item.image_url ? (
          <Image src={item.image_url} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
        <span className={cn(
          "text-[11px] font-medium",
          item.is_available ? "text-primary" : "text-muted-foreground",
        )}>
          {item.is_available ? "Đang bán" : "Tạm ẩn"}
        </span>
      </div>

      <label className="w-full shrink-0 pl-[7.25rem] sm:w-auto sm:pl-0">
        <span className="sr-only">Chuyển {item.name} đến vị trí</span>
        <select
          value=""
          disabled={disabled || peers.length < 2}
          onChange={(event) => {
            const value = event.target.value;
            if (value) onMove(value === "__end__" ? null : value);
          }}
          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:max-w-44"
        >
          <option value="">Chuyển đến…</option>
          {peers.filter((peer) => peer.id !== item.id).map((peer) => (
            <option key={peer.id} value={peer.id}>Trước {peer.name}</option>
          ))}
          <option value="__end__">Cuối danh sách</option>
        </select>
      </label>
    </Reorder.Item>
  );
}

/** Render the menu ordering workspace as three single-column sortable sections. */
export default function MenuReorderPanel({
  groups,
  filter,
  disabled,
  onFilterChange,
  onReorder,
  onMove,
}: MenuReorderPanelProps) {
  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2" aria-label="Lọc món khi sắp xếp">
        {(["active", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            disabled={disabled}
            onClick={() => onFilterChange(value)}
            className={cn(
              "min-h-10 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary/40",
            )}
          >
            {value === "active" ? "Đang bán" : "Toàn bộ menu"}
          </button>
        ))}
      </div>

      {SECTIONS.map(({ category, label }) => {
        const visibleItems = groups[category].filter((item) => filter === "all" || item.is_available);
        return (
          <section key={category} className="space-y-2" aria-labelledby={`reorder-${category}`}>
            <div className="flex items-center gap-3">
              <h2 id={`reorder-${category}`} className="text-sm font-bold text-foreground">{label}</h2>
              <span className="text-xs text-muted-foreground">{visibleItems.length} món</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {visibleItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Không có món phù hợp.
              </p>
            ) : (
              <Reorder.Group
                axis="y"
                values={visibleItems}
                onReorder={(items) => onReorder(category, items)}
                className="space-y-2"
              >
                {visibleItems.map((item) => (
                  <DraggableMenuRow
                    key={item.id}
                    item={item}
                    peers={visibleItems}
                    disabled={disabled}
                    onMove={(beforeId) => onMove(category, item.id, beforeId)}
                  />
                ))}
              </Reorder.Group>
            )}
          </section>
        );
      })}
    </div>
  );
}
