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

/** Size label map for the 3 sizes shown on the card. */
const SIZE_CARD_LABELS: Record<string, string> = {
  M: "Cá Con",
  L: "Cá Vừa",
  XL: "Cá Lớn",
};

/** MenuCard — displays a single menu item in the customer menu grid. */
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

  const isReversed = index % 2 !== 0;

  return (
    <motion.div
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      className={`group flex ${
        isReversed ? 'flex-row-reverse' : 'flex-row'
      } h-40 md:h-48 bg-white/80 backdrop-blur-md rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md border border-border/60 transition-all duration-300 cursor-pointer`}
    >
      {/* Image Area - 45% width */}
      <div className="w-[45%] bg-[#eef1eb] relative overflow-hidden flex-shrink-0">
        {item.is_seasonal && (
          <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm text-amber-600 text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1 border border-amber-200/50">
            <span>✨ Theo mùa</span>
          </div>
        )}
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Coffee className="w-12 h-12 text-[#b8c9b4] group-hover:scale-110 transition-transform duration-500" />
          </div>
        )}
      </div>

      {/* Content Area - 55% width */}
      <div className="flex flex-col w-[55%] px-4 md:px-5 py-4 bg-transparent justify-between">
        <div>
          <h3 className="font-serif font-medium text-lg text-[#2d4a22] leading-tight line-clamp-2 mb-1.5">
            {item.name}
          </h3>
          {item.description && (
            <p className="text-xs text-primary/60 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Sizes & Prices - Horizontal Layout */}
        <div className={`mt-auto pt-2 flex items-end gap-3 ${isReversed ? 'justify-end text-right' : 'justify-start text-left'}`}>
          {sizes.map((s) => {
            const isDefault = s.size === 'L';
            const price = getDisplayPrice(s) / 1000;
            
            return (
              <div key={s.size} className={`flex flex-col ${isReversed ? 'items-end' : 'items-start'} gap-0.5`}>
                <span className={`uppercase tracking-wide whitespace-nowrap ${isDefault ? 'text-[10px] font-bold text-[#446c35]' : 'text-[9px] font-medium text-primary/40'}`}>
                  {SIZE_CARD_LABELS[s.size] ?? s.size}
                </span>
                <span className={`${isDefault ? 'text-base font-bold text-[#2d4a22]' : 'text-sm font-semibold text-primary/50'}`}>
                  {price}k
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
