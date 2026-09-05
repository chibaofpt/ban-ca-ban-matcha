"use client";

import { useState } from "react";
import { ChevronDown, ImageIcon, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/src/utils/cn";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { formatMoney } from "@/src/utils/pricing";

interface AddonGroupCardProps {
  item: AdminAddonGroup;
  onEdit: (item: AdminAddonGroup) => void;
  onToggleActive: (id: string, next: boolean) => void;
  onDelete: (item: AdminAddonGroup) => void;
}
export default function AddonGroupCard({
  item,
  onEdit,
  onToggleActive,
  onDelete,
}: AddonGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const activeOptionCount = item.options.filter((option) => option.is_active).length;
  const optionsRegionId = `addon-options-${item.id}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition",
        !item.is_active && "opacity-60"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={optionsRegionId}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-secondary/30">
            {item.image_url ? (
              <Image
                src={item.image_url}
                alt={`Ảnh ${item.name}`}
                width={56}
                height={56}
                sizes="56px"
                quality={60}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{item.name}</h3>
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                item.is_dynamic_gram
                  ? "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
              )}>
                {item.is_dynamic_gram ? "Theo gram" : "Giá cố định"}
              </span>
              <span className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Chọn tối đa {item.max_select}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {activeOptionCount}/{item.options.length} tùy chọn đang hiển thị
            </p>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2 sm:border-l sm:border-t-0">
          <span className="mr-auto text-xs font-medium text-muted-foreground sm:sr-only">
            {item.is_active ? "Nhóm đang bật" : "Nhóm đã ẩn"}
          </span>
          <button
            type="button"
            role="switch"
            aria-label={`Trạng thái nhóm ${item.name}`}
            aria-checked={item.is_active}
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive(item.id, !item.is_active);
            }}
            className="flex h-10 w-12 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className={cn("relative h-6 w-11 rounded-full transition-colors", item.is_active ? "bg-primary" : "bg-border")}>
              <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", item.is_active && "translate-x-5")} />
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/30 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Sửa nhóm ${item.name}`}
            title="Sửa nhóm"
          >
            <Pencil size={16} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/30 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            aria-label={`Ẩn nhóm ${item.name}`}
            title="Xóa nhóm"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div
        id={optionsRegionId}
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/50 bg-secondary/10 p-4">
            {item.options.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nhóm này chưa có tùy chọn nào.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {item.options.map((opt) => (
                  <div key={opt.id} className={cn("flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm", !opt.is_active && "opacity-60")}>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary/30">
                      {(opt.image_url ?? item.image_url) ? (
                        <Image
                          src={(opt.image_url ?? item.image_url) as string}
                          alt={`Ảnh ${opt.label}`}
                          width={56}
                          height={56}
                          sizes="56px"
                          quality={60}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold leading-tight text-foreground">{opt.label}</span>
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">#{opt.sort_order}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-primary">
                        {item.is_dynamic_gram
                          ? opt.gram_value !== null ? `+${opt.gram_value}g` : "Chưa có gram"
                          : opt.price_vnd > 0 ? `+${formatMoney(opt.price_vnd)}` : "Miễn phí"}
                      </p>
                      <p className="mt-auto pt-1 text-[11px] text-muted-foreground">
                        {item.is_dynamic_gram ? "Giá tính theo bột đã chọn" : "Giá cộng cố định"}
                        {!opt.is_active ? " · Đã ẩn" : " · Đang hiển thị"}
                      </p>
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
