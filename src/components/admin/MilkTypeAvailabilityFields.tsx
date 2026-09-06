"use client";

import { useMemo, useState } from "react";
import { LockKeyhole, Search } from "lucide-react";
import { motion } from "framer-motion";
import type { AdminMenuItem } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";

type DrinkCategory = "all" | "latte" | "fusion";

interface MilkTypeAvailabilityFieldsProps {
  menuItems: AdminMenuItem[];
  baseLiquidId: string;
  isGlobalDefault: boolean;
  value: string[];
  disabled: boolean;
  onChange: (menuItemIds: string[]) => void;
}

/** Renders the searchable Latte/Fusion availability selector for one Base Liquid. */
export default function MilkTypeAvailabilityFields({
  menuItems,
  baseLiquidId,
  isGlobalDefault,
  value,
  disabled,
  onChange,
}: MilkTypeAvailabilityFieldsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<DrinkCategory>("all");
  const implicitIds = useMemo(() => new Set(
    menuItems
      .filter((menuItem) => (
        (isGlobalDefault && menuItem.category === "latte")
        || menuItem.default_base_liquid_id === baseLiquidId
      ))
      .map((menuItem) => menuItem.id),
  ), [baseLiquidId, isGlobalDefault, menuItems]);
  const selectedIds = useMemo(
    () => new Set([...value, ...implicitIds]),
    [implicitIds, value],
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return menuItems.filter((menuItem) => (
      (category === "all" || menuItem.category === category)
      && (normalizedQuery === "" || menuItem.name.toLowerCase().includes(normalizedQuery))
    ));
  }, [category, menuItems, searchQuery]);
  const editableVisibleIds = visibleItems
    .filter((menuItem) => !implicitIds.has(menuItem.id))
    .map((menuItem) => menuItem.id);
  const allEditableVisibleSelected = editableVisibleIds.length > 0
    && editableVisibleIds.every((id) => selectedIds.has(id));

  const toggleMenuItem = (menuItemId: string) => {
    if (disabled || implicitIds.has(menuItemId)) return;
    const next = new Set(value);
    if (next.has(menuItemId)) next.delete(menuItemId);
    else next.add(menuItemId);
    onChange([...next]);
  };

  const toggleVisibleItems = () => {
    if (disabled || editableVisibleIds.length === 0) return;
    const next = new Set(value);
    for (const id of editableVisibleIds) {
      if (allEditableVisibleSelected) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  };

  return (
    <section className="space-y-3 border-t border-border pt-4" aria-labelledby="base-liquid-availability-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="base-liquid-availability-title" className="text-sm font-semibold text-foreground">
            Khả dụng ở món
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Chọn nhiều món một lần. Món dùng Base Liquid này làm mặc định sẽ luôn được giữ lại.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {selectedIds.size}/{menuItems.length}
        </span>
      </div>

      <div className="relative">
        <label htmlFor="base-liquid-menu-search" className="sr-only">Tìm món</label>
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="base-liquid-menu-search"
          type="search"
          value={searchQuery}
          disabled={disabled}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Tìm tên món..."
          className="min-h-10 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          ["all", "Tất cả"],
          ["latte", "Latte"],
          ["fusion", "Fusion"],
        ] as const).map(([id, label]) => (
          <motion.button
            key={id}
            type="button"
            aria-pressed={category === id}
            disabled={disabled}
            whileTap={{ scale: 0.92 }}
            onClick={() => setCategory(id)}
            className={cn(
              "min-h-10 shrink-0 rounded-xl border px-3 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50",
              category === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </motion.button>
        ))}
        <motion.button
          type="button"
          disabled={disabled || editableVisibleIds.length === 0}
          whileTap={{ scale: 0.92 }}
          onClick={toggleVisibleItems}
          className="ml-auto min-h-10 shrink-0 rounded-xl px-3 text-sm font-medium text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
        >
          {allEditableVisibleSelected ? "Bỏ kết quả" : "Chọn kết quả"}
        </motion.button>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none rounded-xl border border-border bg-secondary/10 p-2">
        {visibleItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Không tìm thấy món phù hợp.</p>
        ) : visibleItems.map((menuItem) => {
          const isImplicit = implicitIds.has(menuItem.id);
          const isChecked = selectedIds.has(menuItem.id);
          return (
            <motion.label
              key={menuItem.id}
              whileTap={isImplicit || disabled ? undefined : { scale: 0.98 }}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg border bg-background px-3 py-2 transition",
                isImplicit ? "cursor-not-allowed border-primary/20" : "cursor-pointer border-transparent hover:border-border",
                disabled && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={disabled || isImplicit}
                onChange={() => toggleMenuItem(menuItem.id)}
                className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{menuItem.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="uppercase">{menuItem.category}</span>
                  {!menuItem.is_available && <span>· Tạm ngưng bán</span>}
                </span>
              </span>
              {isImplicit && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  Mặc định
                </span>
              )}
            </motion.label>
          );
        })}
      </div>
    </section>
  );
}
