"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check, Info, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import type { Powder } from "@/src/lib/types/powder";
import type { Size } from "@/src/lib/types/menu";
import { cn } from "@/src/utils/cn";
import { formatKa } from "@/src/utils/display";

interface PowderSelectorProps {
  powderList: string[];
  powders: Powder[];
  selectedPowderId: string;
  defaultPowderId: string | null;
  onChange: (powderId: string) => void;
  getPriceForContext: (
    targetSize: Size,
    targetPowderId: string,
    milkId?: string,
  ) => { unitPrice: number };
  defaultPowderPriceCtx: { unitPrice: number };
  selectedSize: Size;
}

interface FlavorBarProps {
  label: string;
  value: number | null;
}

/** Renders a single flavor attribute as a 5-dot progress bar. */
function FlavorBar({ label, value }: FlavorBarProps) {
  if (value === null) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-primary/60 w-16 shrink-0">{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              i < value ? "bg-primary" : "bg-primary/15",
            )}
          />
        ))}
      </div>
    </div>
  );
}

interface PowderInfoPopoverProps {
  powder: Powder;
}

/** Click-to-open popover showing full powder info + flavor chart. Safe on mobile (no hover required). */
function PowderInfoPopover({ powder }: PowderInfoPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary/50 hover:bg-primary/15 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Xem thÃ´ng tin ${powder.name}`}
        >
          <Info className="h-4 w-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-[200] w-72 max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto overscroll-contain rounded-2xl bg-[#fdfcf7] shadow-xl border border-border/50 p-4 focus:outline-none"
          onInteractOutside={() => setOpen(false)}
        >
          {/* Close button */}
          <Popover.Close asChild>
            <button
              type="button"
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/8 text-primary/50 hover:bg-primary/15"
              aria-label="ÄÃ³ng"
            >
              <X className="h-4 w-4" />
            </button>
          </Popover.Close>

          {/* Powder image */}
          {powder.image_url && (
            <div className="mb-3 w-full aspect-square overflow-hidden rounded-xl bg-primary/5">
              <Image
                src={powder.image_url}
                alt={`áº¢nh bá»™t ${powder.name}`}
                width={256}
                height={256}
                unoptimized
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {/* Name + manufacturer */}
          <p className="pr-6 text-sm font-bold text-primary leading-tight">{powder.name}</p>
          {powder.manufacturer && (
            <p className="mt-0.5 text-xs text-primary/55 font-medium">{powder.manufacturer}</p>
          )}

          {/* Description */}
          {powder.description && (
            <p className="mt-2 text-xs leading-relaxed text-primary/65">{powder.description}</p>
          )}

          {/* Flavor chart */}
          {(powder.fragrance !== null || powder.body !== null || powder.bitterness !== null || powder.umami !== null || powder.color !== null) && (
            <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary/50 mb-2">HÆ°Æ¡ng vá»‹</p>
              <FlavorBar label="HÆ°Æ¡ng thÆ¡m" value={powder.fragrance} />
              <FlavorBar label="Äá»™ Ä‘áº­m" value={powder.body} />
              <FlavorBar label="Äáº¯ng" value={powder.bitterness} />
              <FlavorBar label="Umami" value={powder.umami} />
              <FlavorBar label="MÃ u sáº¯c" value={powder.color} />
            </div>
          )}

          <Popover.Arrow className="fill-[#fdfcf7]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Displays Fusion powders as readable full-width rows with descriptions and info popover. */
export function PowderSelector({
  powderList,
  powders,
  selectedPowderId,
  defaultPowderId,
  onChange,
  getPriceForContext,
  defaultPowderPriceCtx,
  selectedSize,
}: PowderSelectorProps) {
  if (powderList.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {powderList.map((powderId) => {
        const powder = powders.find((candidate) => candidate.id === powderId);
        if (!powder) return null;

        const isDefault = powderId === defaultPowderId;
        const isActive = selectedPowderId === powderId;
        const priceContext = getPriceForContext(selectedSize, powderId);
        const difference = priceContext.unitPrice - defaultPowderPriceCtx.unitPrice;
        const priceLabel = isDefault
          ? "Máº·c Ä‘á»‹nh"
          : difference === 0
            ? "CÃ¹ng giÃ¡"
            : `${difference > 0 ? "+" : "-"}${formatKa(
                Math.abs(difference),
                difference > 0 ? "ceil" : "floor",
              )}`;

        return (
          /* Wrapper: selection button + info trigger are SIBLINGS, not nested */
          <div key={powderId} className="flex min-w-0 items-stretch gap-1">
            {/* Card: selects the powder */}
            <button
              type="button"
              onClick={() => onChange(powderId)}
              className={cn(
                "flex min-h-16 min-w-0 flex-1 items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white hover:border-primary/30",
              )}
            >
              {powder.image_url && (
                <Image
                  src={powder.image_url}
                  alt={`áº¢nh bá»™t ${powder.name}`}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
              )}
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  isActive ? "border-primary bg-primary text-white" : "border-primary/25",
                )}
              >
                {isActive && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-primary">{powder.name}</span>
                {powder.description && (
                  <span className="mt-1 block text-xs leading-relaxed text-primary/65">
                    {powder.description}
                  </span>
                )}
              </span>
              {/* Price tag */}
              <span
                className={cn(
                  "shrink-0 pt-0.5 text-xs font-bold",
                  difference > 0 ? "text-[#c74646]" : "text-primary/70",
                )}
              >
                {priceLabel}
              </span>
            </button>

            {/* Info button: sibling of card, not inside it â€” prevents nested interactive elements */}
            <PowderInfoPopover powder={powder} />
          </div>
        );
      })}
    </div>
  );
}
