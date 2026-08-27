import React from "react";
import OptionCard from "./OptionCard";
import type { MilkTypeOption, Size } from "@/src/lib/types/menu";
import { formatKa } from "@/src/utils/display";

interface MilkSelectorProps {
  milkTypes: MilkTypeOption[];
  selectedMilkId: string;
  defaultMilkId: string;
  onChange: (milkId: string) => void;
  getPriceForContext: (targetSize: Size, targetPowderId: string, milkId?: string) => { baseDrinkPrice: number };
  selectedSize: Size;
  activePowderId: string;
}

/** Displays milk / base liquid options with differential pricing and optional image. */
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
    <div className="mt-2 grid grid-cols-2 gap-2">
      {milkTypes.map((milk) => {
        const isDefault = milk.id === defaultMilkId;
        const milkPrice = getPriceForContext(selectedSize, activePowderId, milk.id).baseDrinkPrice;
        const defMilkPrice = getPriceForContext(selectedSize, activePowderId, defaultMilkId).baseDrinkPrice;
        const diff = milkPrice - defMilkPrice;

        return (
          <OptionCard
            key={milk.id}
            label={milk.name}
            imageUrl={milk.image_url ?? undefined}
            imageAlt={`Ảnh ${milk.name}`}
            sub={
              isDefault
                ? "Mặc định"
                : diff > 0
                  ? `+${formatKa(diff, "ceil")}`
                  : diff < 0
                    ? `-${formatKa(Math.abs(diff), "floor")}`
                    : "Cùng giá"
            }
            isActive={selectedMilkId === milk.id}
            onClick={() => onChange(milk.id)}
            layout="stacked"
          />
        );
      })}
    </div>
  );
}
