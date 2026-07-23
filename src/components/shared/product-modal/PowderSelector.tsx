import React from "react";
import { Check } from "lucide-react";
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

/** Displays Fusion powders as readable full-width rows with descriptions. */
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
          ? "Mặc định"
          : difference === 0
            ? "Cùng giá"
            : `${difference > 0 ? "+" : "-"}${formatKa(
                Math.abs(difference),
                difference > 0 ? "ceil" : "floor",
              )}`;

        return (
          <button
            key={powderId}
            type="button"
            onClick={() => onChange(powderId)}
            className={cn(
              "flex min-h-16 w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              isActive
                ? "border-primary bg-primary/5"
                : "border-border bg-white hover:border-primary/30",
            )}
          >
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
            <span
              className={cn(
                "shrink-0 pt-0.5 text-xs font-bold",
                difference > 0 ? "text-[#c74646]" : "text-primary/70",
              )}
            >
              {priceLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
