import React from "react";
import OptionCard from "./OptionCard";
import type { Size } from "@/src/lib/types/menu";
import { formatKa, getSizeDisplay } from "@/src/utils/display";

interface SizeSelectorProps {
  sizes: { size: Size; base_price_vnd: number; milk_ml?: number | null }[];
  selectedSize: Size;
  onChange: (size: Size) => void;
  getPriceForContext: (targetSize: Size, targetPowderId: string, milkId?: string) => { unitPrice: number };
  activePowderId: string;
}

export function SizeSelector({ sizes, selectedSize, onChange, getPriceForContext, activePowderId }: SizeSelectorProps) {
  if (sizes.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2.5 mt-3">
      {sizes.map((s) => {
        const sizePrice = getPriceForContext(s.size, activePowderId).unitPrice;
        const display = getSizeDisplay(s.size);
        return (
          <OptionCard
            key={s.size}
            label={display.label}
            meta={display.volume}
            sub={formatKa(sizePrice, "ceil")}
            isActive={selectedSize === s.size}
            onClick={() => onChange(s.size)}
          />
        );
      })}
    </div>
  );
}
