import React from "react";
import OptionCard from "./OptionCard";
import type { Powder } from "@/src/lib/types/powder";
import type { Size } from "@/src/lib/types/menu";

interface PowderSelectorProps {
  powderList: string[];
  powders: Powder[];
  selectedPowderId: string;
  defaultPowderId: string | null;
  onChange: (powderId: string) => void;
  getPriceForContext: (targetSize: Size, targetPowderId: string, milkId?: string) => { unitPrice: number };
  defaultPowderPriceCtx: { unitPrice: number };
  selectedSize: Size;
}

export function PowderSelector({
  powderList,
  powders,
  selectedPowderId,
  defaultPowderId,
  onChange,
  getPriceForContext,
  defaultPowderPriceCtx,
  selectedSize
}: PowderSelectorProps) {
  if (powderList.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {powderList.map((pid) => {
        const pwd = powders.find((p) => p.id === pid);
        if (!pwd) return null;
        
        const isDefault = pid === defaultPowderId;
        const priceCtx = getPriceForContext(selectedSize, pid);
        const diff = priceCtx.unitPrice - defaultPowderPriceCtx.unitPrice;
        
        return (
          <OptionCard
            key={pid}
            label={pwd.name}
            sub={isDefault ? "Mặc định" : diff !== 0 ? `${diff > 0 ? "+" : ""}${diff / 1000} ká` : "Cùng giá"}
            isActive={selectedPowderId === pid}
            onClick={() => onChange(pid)}
          />
        );
      })}
    </div>
  );
}
