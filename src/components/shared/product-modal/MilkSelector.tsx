import React from "react";
import { OptionCard } from "./OptionCard";
import type { MilkTypeOption, Size } from "@/src/lib/types/menu";

interface MilkSelectorProps {
  milkTypes: MilkTypeOption[];
  selectedMilkId: string;
  defaultMilkId: string;
  onChange: (milkId: string) => void;
  getPriceForContext: (targetSize: Size, targetPowderId: string, milkId?: string) => { baseDrinkPrice: number };
  selectedSize: Size;
  activePowderId: string;
}

export function MilkSelector({
  milkTypes,
  selectedMilkId,
  defaultMilkId,
  onChange,
  getPriceForContext,
  selectedSize,
  activePowderId
}: MilkSelectorProps) {
  if (milkTypes.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {milkTypes.map((milk) => {
        const isDefault = milk.id === defaultMilkId;
        const milkPrice = getPriceForContext(selectedSize, activePowderId, milk.id).baseDrinkPrice;
        const defMilkPrice = getPriceForContext(selectedSize, activePowderId, defaultMilkId).baseDrinkPrice;
        const diff = milkPrice - defMilkPrice;
        
        return (
          <OptionCard
            key={milk.id}
            label={milk.name}
            sub={isDefault ? "Mặc định" : diff > 0 ? `+${diff / 1000} ká` : diff < 0 ? `${diff / 1000} ká` : "Cùng giá"}
            isActive={selectedMilkId === milk.id}
            onClick={() => onChange(milk.id)}
          />
        );
      })}
    </div>
  );
}
