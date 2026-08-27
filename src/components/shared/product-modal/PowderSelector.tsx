"use client";

import React, { useState } from "react";
import Image from "next/image";
import { MoreVertical, X } from "lucide-react";
import { Drawer } from "vaul";
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

interface PowderDetailSheetProps {
  powder: Powder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Nested bottom sheet showing full powder info + flavor chart. Renders above the product modal. */
function PowderDetailSheet({ powder, open, onOpenChange }: PowderDetailSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} nested>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/30 z-[200]" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[201] outline-none bg-[#fdfcf7] shadow-2xl rounded-t-3xl max-h-[80dvh] flex flex-col after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit"
        >
          <Drawer.Title className="sr-only">Chi tiết bột {powder.name}</Drawer.Title>
          <Drawer.Description className="sr-only">Thông tin chi tiết về bột {powder.name}</Drawer.Description>

          {/* Drag handle */}
          <div className="flex items-start justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-border rounded-full" />
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
            {/* Close button */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/8 text-primary/50 hover:bg-primary/15 z-10"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Powder image */}
            {powder.image_url && (
              <div className="mx-auto mb-4 aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-primary/5">
                <Image
                  src={powder.image_url}
                  alt={`Ảnh bột ${powder.name}`}
                  width={300}
                  height={300}
                  sizes="(max-width: 339px) calc(100vw - 40px), 300px"
                  quality={75}
                  loading="eager"
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {/* Name + manufacturer */}
            <p className="pr-8 text-lg font-bold text-primary leading-tight">{powder.name}</p>
            {powder.manufacturer && (
              <p className="mt-1 text-sm text-primary/55 font-medium">{powder.manufacturer}</p>
            )}

            {/* Description */}
            {powder.description && (
              <p className="mt-3 text-sm leading-relaxed text-primary/65">{powder.description}</p>
            )}

            {/* Flavor chart */}
            {(powder.fragrance !== null || powder.body !== null || powder.bitterness !== null || powder.umami !== null || powder.color !== null) && (
              <div className="mt-4 border-t border-border/40 pt-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-primary/50">Hương vị</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <FlavorBar label="Hương thơm" value={powder.fragrance} />
                  <FlavorBar label="Độ đậm" value={powder.body} />
                  <FlavorBar label="Đắng" value={powder.bitterness} />
                  <FlavorBar label="Umami" value={powder.umami} />
                  <FlavorBar label="Màu sắc" value={powder.color} />
                </div>
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Displays Fusion powders as readable full-width rows with descriptions and detail bottom sheet. */
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
  const [detailPowder, setDetailPowder] = useState<Powder | null>(null);

  if (powderList.length === 0) return null;

  return (
    <>
      <div className="mt-2 space-y-2">
        {powderList.map((powderId) => {
          const powder = powders.find((candidate) => candidate.id === powderId);
          if (!powder) return null;

          const isDefault = powderId === defaultPowderId;
          const isActive = selectedPowderId === powderId;
          const priceContext = getPriceForContext(selectedSize, powderId);
          const difference = priceContext.unitPrice - defaultPowderPriceCtx.unitPrice;
          const priceLabel = isDefault
            ? "Mặc định"
            : difference === 0
              ? "Cùng giá"
              : `${difference > 0 ? "+" : "-"}${formatKa(
                  Math.abs(difference),
                  difference > 0 ? "ceil" : "floor",
                )}`;

          return (
            <div
              key={powderId}
              className={cn(
                "relative w-full min-w-0 rounded-2xl border-2 p-2 text-left transition-colors",
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white hover:border-primary/30",
              )}
            >
              <button
                type="button"
                onClick={() => onChange(powderId)}
                className="flex w-full min-w-0 items-start gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/5">
                  {powder.image_url ? (
                    <Image
                      src={powder.image_url}
                      alt={`Ảnh bột ${powder.name}`}
                      width={48}
                      height={48}
                      sizes="48px"
                      quality={60}
                      loading="lazy"
                      className="h-12 w-12 object-contain"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2 pr-9 leading-tight">
                    <span className="min-w-0 flex-1 text-sm font-bold text-primary">{powder.name}</span>
                    <span className={cn("shrink-0 text-xs font-bold", difference > 0 ? "text-[#c74646]" : "text-primary/70")}>
                      {priceLabel}
                    </span>
                  </div>
                  {powder.description && (
                    <p className="mt-0.5 text-xs leading-snug text-primary/65">{powder.description}</p>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDetailPowder(powder)}
                className="absolute right-1 top-1 z-10 flex h-10 w-10 items-center justify-center text-primary/60 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Xem thông tin ${powder.name}`}
              >
                <MoreVertical className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Powder detail bottom sheet — nested above product modal */}
      {detailPowder && (
        <PowderDetailSheet
          powder={detailPowder}
          open={!!detailPowder}
          onOpenChange={(open) => { if (!open) setDetailPowder(null); }}
        />
      )}
    </>
  );
}
