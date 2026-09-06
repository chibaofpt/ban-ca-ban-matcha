"use client";

import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/src/utils/cn";

interface ReorderButtonsProps {
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  pendingDirection?: "up" | "down" | null;
  label: string;
  onUp: () => void;
  onDown: () => void;
  className?: string;
  tone?: "default" | "on-primary";
  dense?: boolean;
}

/** Render accessible up/down ordering controls shared by add-on groups and options. */
export default function ReorderButtons({
  isFirst,
  isLast,
  busy,
  pendingDirection = null,
  label,
  onUp,
  onDown,
  className,
  tone = "default",
  dense = false,
}: ReorderButtonsProps) {
  const buttonClass = cn(
    "flex h-10 w-10 items-center justify-center rounded-md border transition-[transform,color,background-color] duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40",
    tone === "on-primary"
      ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 focus-visible:ring-primary-foreground"
      : "border-border bg-background text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus-visible:ring-ring",
  );

  return (
    <div className={cn("inline-flex shrink-0 items-center", dense ? "gap-1" : "gap-2", className)} role="group" aria-label={`Sắp xếp ${label}`}>
      <button
        type="button"
        onClick={onUp}
        disabled={isFirst || busy}
        className={buttonClass}
        aria-label={`Đưa ${label} lên`}
      >
        {pendingDirection === "up" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={isLast || busy}
        className={buttonClass}
        aria-label={`Đưa ${label} xuống`}
      >
        {pendingDirection === "down" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
