import { Coffee, CupSoda, Sparkles } from "lucide-react";
import type { RefObject } from "react";

import MenuCard from "@/src/components/menu/MenuCard";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import { getMenuItemCartInfo } from "@/src/utils/customerUx";

interface MenuPanelsProps {
  loading: boolean;
  latteItems: MenuItem[];
  fusionItems: MenuItem[];
  extrasItems: MenuItem[];
  seasonalItems: MenuItem[];
  milkTypes: MilkTypeOption[];
  cartItems: CartItem[];
  latteSectionRef: RefObject<HTMLDivElement | null>;
  fusionSectionRef: RefObject<HTMLDivElement | null>;
  extrasSectionRef: RefObject<HTMLDivElement | null>;
  seasonalSectionRef: RefObject<HTMLDivElement | null>;
  onItemClick: (item: MenuItem) => void;
}

interface ItemSectionProps {
  title: "Latte" | "Fusion" | "Add-on" | "Seasonal";
  items: MenuItem[];
  milkTypes: MilkTypeOption[];
  cartItems: CartItem[];
  sectionRef: RefObject<HTMLDivElement | null>;
  onItemClick: (item: MenuItem) => void;
}

/** Renders the customer menu as vertically scrollable category sections. */
export function MenuPanels(props: MenuPanelsProps) {
  const { loading, latteItems, fusionItems, extrasItems, seasonalItems } = props;
  return (
    <div className="w-full space-y-8 pb-8 px-0.5">
      {loading ? <MenuSkeleton count={6} /> : (
        <>
          <ItemSection title="Latte" items={latteItems} milkTypes={props.milkTypes} cartItems={props.cartItems} sectionRef={props.latteSectionRef} onItemClick={props.onItemClick} />
          <ItemSection title="Fusion" items={fusionItems} milkTypes={props.milkTypes} cartItems={props.cartItems} sectionRef={props.fusionSectionRef} onItemClick={props.onItemClick} />
          <ItemSection title="Add-on" items={extrasItems} milkTypes={props.milkTypes} cartItems={props.cartItems} sectionRef={props.extrasSectionRef} onItemClick={props.onItemClick} />
          <ItemSection title="Seasonal" items={seasonalItems} milkTypes={props.milkTypes} cartItems={props.cartItems} sectionRef={props.seasonalSectionRef} onItemClick={props.onItemClick} />
        </>
      )}
    </div>
  );
}

function ItemSection({
  title,
  items,
  milkTypes,
  cartItems,
  sectionRef,
  onItemClick,
}: ItemSectionProps) {
  const isFusion = title === "Fusion";
  const isExtras = title === "Add-on";
  const isSeasonal = title === "Seasonal";
  return (
    <div>
      <div
        ref={sectionRef}
        className={`scroll-mt-32 flex items-center gap-3 mb-4${isFusion ? "" : " mt-2"}`}
      >
        <h2 className="font-serif text-xl font-bold text-[#2d4a22]">{title}</h2>
        <div className="flex-1 h-px bg-primary/10" />
      </div>
      {isSeasonal && (
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Món theo mùa có thể hết trước khi được thông báo.
        </p>
      )}
      {items.length === 0 ? (
        <div className="py-12 text-center text-primary/40 space-y-2">
          {isSeasonal || isExtras ? (
            <Sparkles className="mx-auto h-10 w-10" aria-hidden="true" />
          ) : isFusion ? (
            <CupSoda className="mx-auto h-10 w-10" aria-hidden="true" />
          ) : (
            <Coffee className="mx-auto h-10 w-10" aria-hidden="true" />
          )}
          <p className="text-sm font-medium">Chưa có món {title.toLowerCase()} nào</p>
        </div>
      ) : (
        <ItemGrid
          items={items}
          milkTypes={milkTypes}
          cartItems={cartItems}
          onItemClick={onItemClick}
          priorityCount={title === "Latte" ? 2 : 0}
        />
      )}
    </div>
  );
}

function ItemGrid({
  items,
  milkTypes,
  cartItems,
  onItemClick,
  priorityCount,
}: Pick<MenuPanelsProps, "milkTypes" | "cartItems" | "onItemClick"> & {
  items: MenuItem[];
  priorityCount: number;
}) {
  return (
    <div className="flex flex-col gap-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8">
      {items.map((item, index) => {
        const info = getMenuItemCartInfo(cartItems, item.id);
        return (
          <MenuCard
            key={item.id}
            item={item}
            milkTypes={milkTypes}
            cartQuantity={info.quantity}
            cartVariantCount={info.variantCount}
            cartHasVoucher={info.hasVoucher}
            onItemClick={onItemClick}
            priority={index < priorityCount}
          />
        );
      })}
    </div>
  );
}

function MenuSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8 w-full">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-[130px] w-full bg-secondary/20 animate-pulse rounded-2xl mb-4" />
      ))}
    </div>
  );
}
