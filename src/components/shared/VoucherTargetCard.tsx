"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { computeVoucherItemPrice, resolveVoucherBaseLiquidId } from "@/src/hooks/useAddVoucherToCart";
import type { MenuData, MenuItem, Size } from "@/src/lib/types/menu";
import { formatKa, formatSizeLabel } from "@/src/utils/display";
import { cn } from "@/src/utils/cn";
import { CartMoney } from "./CartMoney";

interface VoucherTargetCardProps {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  configurationText?: string;
  priceVnd?: number | null;
  priceFrom?: boolean;
  cartMoney?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

/** Render one voucher drink, extras item or addon with the same image and price layout. */
export function VoucherTargetCard({ name, description, imageUrl, configurationText, priceVnd, priceFrom, cartMoney = false, disabled, selected, onClick }: VoucherTargetCardProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageSrc = imageUrl && imageUrl !== failedImageUrl ? imageUrl : "/chawan.png";
  return (
    <motion.div
      whileTap={onClick && !disabled ? { scale: 0.96 } : undefined}
      transition={{ duration: 0.2 }}
      className={cn("relative flex min-h-[92px] w-full items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary px-2.5 py-2 text-primary-foreground shadow-md", selected && "border-primary ring-2 ring-primary", disabled && "opacity-50")}
    >
      {onClick ? <button type="button" disabled={disabled} onClick={onClick} aria-label={`Chọn ${name}${configurationText ? `, ${configurationText}` : ""}`} aria-pressed={selected} className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed" /> : null}
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-xl bg-background/20">
        <Image src={imageSrc} alt={imageSrc === "/chawan.png" ? "Minh họa matcha" : name} fill sizes="76px" className="object-cover" onError={() => setFailedImageUrl(imageSrc)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <h3 className="break-words font-serif text-base font-medium leading-tight">{name}</h3>
        {description?.trim() ? <p className="line-clamp-2 break-words text-[11px] leading-relaxed">{description}</p> : null}
        {configurationText ? <p className="break-words text-xs leading-relaxed">{configurationText}</p> : null}
        <p className="mt-1 text-right text-sm font-bold">Giá món: {priceVnd == null ? "Chưa khả dụng" : <>{priceFrom ? "từ " : ""}{cartMoney ? <CartMoney amountVnd={priceVnd} /> : formatKa(priceVnd)}</>}</p>
      </div>
    </motion.div>
  );
}

interface VoucherMenuTargetCardProps {
  item: MenuItem;
  menuData: MenuData;
  allowedSizes?: Size[];
  configuration?: { size?: Size | null; powderId?: string | null; baseLiquidId?: string | null; addonOptionIds?: string[] };
  priceVnd?: number;
  disabled?: boolean;
  onClick?: () => void;
}

/** Resolve a voucher target's current configuration and price through the shared pricing calculator. */
export function VoucherMenuTargetCard({ item, menuData, allowedSizes, configuration, priceVnd, disabled, onClick }: VoucherMenuTargetCardProps) {
  const powders = usePowderStore((state) => state.data);
  const defaultPowderGram = usePowderStore((state) => state.defaultPowderGram);
  const sizes = item.sizes.filter((row) => row.base_price_vnd != null && (!allowedSizes || allowedSizes.includes(row.size)) && (!configuration?.size || row.size === configuration.size));
  const defaultPowderId = item.category === "latte" ? item.powder?.id : item.resolved_default_powder_id;
  const requestedPowderId = configuration?.powderId;
  const powderId = item.category === "fusion" && requestedPowderId && (requestedPowderId === defaultPowderId || item.allowed_powder_ids.includes(requestedPowderId)) ? requestedPowderId : defaultPowderId;
  const powder = powders.find((candidate) => candidate.id === powderId);
  const liquids = menuData.base_liquids ?? menuData.milk_types;
  const baseLiquidId = resolveVoucherBaseLiquidId(item, configuration?.baseLiquidId ?? null, liquids);
  const liquid = liquids.find((candidate) => candidate.id === baseLiquidId);
  const prices = powder ? sizes.map(({ size }) => {
    const price = computeVoucherItemPrice(item, size, powderId ?? null, baseLiquidId, configuration?.addonOptionIds ?? [], powders, defaultPowderGram, menuData.latte_price_anchors, liquids, menuData.addon_groups);
    return price.drinkPrice + price.addonsCost;
  }) : [];
  const currentPrice = item.category === "extras" ? item.unit_price_vnd : prices.length > 0 ? Math.min(...prices) : null;
  const configurationText = item.category === "extras" ? undefined : [
    sizes.length > 0 ? `Size ${sizes.map(({ size }) => formatSizeLabel(size)).join(" / ")}` : "Size không còn khả dụng",
    powder?.name || item.powder?.name ? `bột ${powder?.name ?? item.powder?.name}` : null,
    liquid?.name,
  ].filter(Boolean).join(" · ");
  return <VoucherTargetCard name={item.name} description={item.description} imageUrl={item.image_url} configurationText={configurationText} priceVnd={priceVnd ?? currentPrice} priceFrom={sizes.length > 1 && priceVnd === undefined} cartMoney={configuration !== undefined} disabled={disabled} onClick={onClick} />;
}
