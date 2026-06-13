"use client";

import React from 'react';
import { Coffee } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuItem } from '@/src/lib/types/menu';
import { usePowderStore } from '@/src/lib/store/powderStore';
import { calcLattePrice, calcFusionPrice, resolveGram } from '@/src/utils/pricing';

interface MenuCardProps {
  item: MenuItem;
  index: number;
  onClick: () => void;
}

const SIZE_CARD_LABELS: Record<string, string> = {
  M: "Cá Con",
  L: "Cá Vừa",
  XL: "Cá Lớn",
};

const MenuCard: React.FC<MenuCardProps> = ({ item, index, onClick }) => {
  const sizes = item.sizes.filter((s) => s.base_price_vnd != null);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  const isLatte = item.category === "latte";
  const defaultPowderId = isLatte ? item.powder?.id : item.resolved_default_powder_id;
  const defaultMilk = item.milk_types?.find(m => m.is_default) ?? item.milk_types?.[0];

  const getDisplayPrice = (sizeObj: MenuItem["sizes"][0]) => {
    const s = sizeObj.size;
    const base = sizeObj.base_price_vnd ?? 0;
    const pwd = powders.find(p => p.id === defaultPowderId);
    const pwdPrice = pwd?.price_per_gram ?? 0;
    const gram = resolveGram(s, item.custom_powder_grams, pwd?.size_config ?? [], defaultPowderGrams);

    if (isLatte) {
      return calcLattePrice({
        base_price_vnd: base,
        gram,
        powder_price_per_gram: pwdPrice,
        milk_ml: sizeObj.milk_ml ?? 0,
        milk_price_per_ml: defaultMilk?.price_per_ml ?? 40
      });
    } else {
      return calcFusionPrice({
        base_price_vnd: base,
        gram,
        powder_price_per_gram: pwdPrice,
        premium_latte: 0
      });
    }
  };

  return (
    <motion.div
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="group flex flex-row items-center justify-between gap-4 md:gap-5 w-full h-[130px] md:h-[150px] border-b border-dashed border-primary/20 last:border-0 transition-all duration-300 cursor-pointer bg-transparent"
    >
      {/* Image Area - 4/5 height */}
      <div className="h-[80%] aspect-square bg-[#eef1eb] relative overflow-hidden flex-shrink-0 rounded-2xl">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Coffee className="w-10 h-10 text-[#b8c9b4] group-hover:scale-110 transition-transform duration-500" />
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex flex-col flex-1 h-[80%] justify-between py-1 text-left items-start">
        <div className="w-full">
          <h3 className="font-serif font-medium text-lg text-[#2d4a22] leading-tight line-clamp-2 mb-1">
            {item.name}
            {item.is_seasonal && (
              <span className="inline-flex items-center bg-amber-50 text-amber-600 text-[8px] font-sans font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-amber-200/50 align-middle ml-2 -translate-y-[1px]">
                ✨ Theo mùa
              </span>
            )}
          </h3>
          {item.description && (
            <p className="text-[11px] text-primary/60 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Sizes & Prices */}
        <div className="mt-auto pt-2 flex items-end gap-6 w-full justify-center">
          {sizes.map((s) => {
            const isDefault = s.size === 'L';
            const price = getDisplayPrice(s) / 1000;
            
            return (
              <div key={s.size} className="flex flex-col items-center gap-0.5 min-w-[36px]">
                <span className={`uppercase tracking-wide whitespace-nowrap ${isDefault ? 'text-[10px] font-bold text-[#446c35]' : 'text-[9px] font-medium text-primary/40'}`}>
                  {SIZE_CARD_LABELS[s.size] ?? s.size}
                </span>
                <span className={`${isDefault ? 'text-base font-bold text-[#5b9a2b]' : 'text-sm font-semibold text-primary/50'}`}>
                  {price} ká
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default MenuCard;
