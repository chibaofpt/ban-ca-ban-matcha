"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/src/utils/cn";

interface VoucherCardFrameProps {
  title: string;
  description?: string | null;
  expiresAt?: string | null;
  expiresAfterDays?: number | null;
  footer?: ReactNode;
  reason?: string | null;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Shared voucher presentation for owned, acquisition, preview and admin cards. */
export function VoucherCardFrame({
  title, description, expiresAt, expiresAfterDays, footer, reason,
  selected = false, dimmed = false, onClick, className,
}: VoucherCardFrameProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const days = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000)) : expiresAfterDays ?? null;
  const expiryClass = days === null ? "text-muted-foreground" : days <= 4 ? "text-destructive" : days <= 14 ? "text-amber-700" : "text-emerald-700";
  const expiryLabel = expiresAt
    ? new Date(expiresAt).getTime() <= now ? "Đã hết hạn" : `Còn ${days} ngày nữa hết hạn`
    : expiresAfterDays != null ? `Có hiệu lực ${expiresAfterDays} ngày sau khi nhận` : "Không hết hạn";
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.96 } : undefined}
      onClick={onClick}
      className={cn(
        "relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-xl border bg-card px-3 py-2 text-left shadow-sm transition-colors",
        selected && "border-primary bg-primary/5",
        onClick && "cursor-pointer hover:border-primary/50",
        className,
      )}
    >
      {onClick ? (
        <button type="button" aria-label={`Xem chi tiết ${title}`}
          onClick={(event) => { event.stopPropagation(); onClick(); }}
          className="absolute inset-0 z-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
      ) : null}
      <div className={cn("col-start-1 row-start-1 min-w-0 space-y-1", dimmed && "opacity-60 grayscale-[40%]")}>
        <p className="break-words text-sm font-bold leading-snug text-foreground">{title}</p>
        {description ? <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        <p className={cn("text-xs font-medium leading-relaxed", expiryClass)}>{expiryLabel}</p>
      </div>
      {reason ? <p className="col-start-1 row-start-2 mt-2 text-xs font-medium leading-relaxed text-destructive">{reason}</p> : null}
      {footer ? <div className="col-start-2 row-start-1 row-span-2 flex max-w-28 items-center justify-end gap-2 self-center">{footer}</div> : null}
    </motion.div>
  );
}
