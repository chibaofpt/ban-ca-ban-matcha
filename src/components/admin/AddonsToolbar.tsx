"use client";

import { Plus, RefreshCw } from "lucide-react";
import { cn } from "@/src/utils/cn";

export type AddonStatusFilter = "active" | "all" | "inactive";

interface AddonsToolbarProps {
  groupCount: number;
  activeCount: number;
  status: AddonStatusFilter;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onStatusChange: (status: AddonStatusFilter) => void;
}

/** Render the in-flow Add-ons title, catalogue actions, progress and status filters. */
export default function AddonsToolbar({
  groupCount,
  activeCount,
  status,
  isLoading,
  isFetching,
  onRefresh,
  onCreate,
  onStatusChange,
}: AddonsToolbarProps) {
  return (
    <div className="relative -mx-4 space-y-2 border-b border-border bg-background px-4 py-2 md:mx-0 md:rounded-xl md:border">
      {isFetching && !isLoading ? (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/15" aria-label="Đang tải lại danh sách">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 p-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-foreground">Addon Groups</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{groupCount} nhóm · {activeCount} đang hoạt động</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" aria-label={isFetching ? "Đang tải lại" : "Tải lại"} onClick={onRefresh} disabled={isFetching} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-sm transition active:scale-95 hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
          <button type="button" onClick={onCreate} className="flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition active:scale-95 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Thêm nhóm</span>
          </button>
        </div>
      </div>

      <div className="-mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-0.5 no-scrollbar md:mx-0 md:px-0">
        {([
          ["all", "Tất cả"],
          ["active", "Đang hoạt động"],
          ["inactive", "Đã ẩn"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => onStatusChange(id)} disabled={isLoading} aria-pressed={status === id} className={cn("shrink-0 snap-start rounded-full border px-4 py-1.5 text-xs font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", status === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary/40")}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
