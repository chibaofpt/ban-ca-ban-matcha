import { Sparkles, Coffee, CupSoda } from "lucide-react";
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
  title: "Latte" | "Fusion" | "Add-on";
  items: MenuItem[];
  milkTypes: MilkTypeOption[];
  cartItems: CartItem[];
  sectionRef: RefObject<HTMLDivElement | null>;
  onItemClick: (item: MenuItem) => void;
}

/** Renders all menu sections (Latte, Fusion, Add-on, Seasonal) in a single scrollable page. */
export function MenuPanels(props: MenuPanelsProps) {
  const {
    loading,
    latteItems,
    fusionItems,
    extrasItems,
    seasonalItems,
    milkTypes,
    cartItems,
    latteSectionRef,
    fusionSectionRef,
    extrasSectionRef,
    seasonalSectionRef,
    onItemClick,
  } = props;

  if (loading) {
    return <MenuSkeleton count={6} />;
  }

  return (
    <div className="w-full pb-8 px-0.5">
      <ItemSection
        title="Latte"
        items={latteItems}
        milkTypes={milkTypes}
        cartItems={cartItems}
        sectionRef={latteSectionRef}
        onItemClick={onItemClick}
      />
      <ItemSection
        title="Fusion"
        items={fusionItems}
        milkTypes={milkTypes}
        cartItems={cartItems}
        sectionRef={fusionSectionRef}
        onItemClick={onItemClick}
      />
      <ItemSection
        title="Add-on"
        items={extrasItems}
        milkTypes={milkTypes}
        cartItems={cartItems}
        sectionRef={extrasSectionRef}
        onItemClick={onItemClick}
      />

      {/* Seasonal section */}
      <div ref={seasonalSectionRef} className="scroll-mt-24 mt-8">
        <div className="flex items-center gap-3 mb-4 mt-2">
          <h2 className="font-serif text-xl font-bold text-[#2d4a22] flex items-center gap-2">
            Seasonal
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </h2>
          <div className="flex-1 h-px bg-primary/10" />
        </div>
        <div className="mb-4 flex gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm leading-relaxed text-green-800">
            Seasonal là những món có dùng bột matcha hoặc công thức pha sẽ được bán trong 1 thời gian giới hạn nên có thể sẽ hết mà không biết trước.
          </p>
        </div>
        {seasonalItems.length === 0 ? (
          <div className="py-24 text-center text-primary/40 space-y-4">
            <Sparkles className="mx-auto h-12 w-12" aria-hidden="true" />
            <p className="font-bold text-lg italic">Hiện chưa có món seasonal</p>
            <p className="text-sm">Quay lại sau nhé!</p>
          </div>
        ) : (
          <ItemGrid
            items={seasonalItems}
            milkTypes={milkTypes}
            cartItems={cartItems}
            onItemClick={onItemClick}
            priorityCount={4}
          />
        )}
      </div>
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
  return (
    <div ref={sectionRef} className={`scroll-mt-24${isFusion || isExtras ? " mt-8" : ""}`}>
      <div className={`flex items-center gap-3 mb-4${isFusion ? "" : " mt-2"}`}>
        <h2 className="font-serif text-xl font-bold text-[#2d4a22]">{title}</h2>
        <div className="flex-1 h-px bg-primary/10" />
      </div>
      {items.length === 0 ? (
        <div className="py-12 text-center text-primary/40 space-y-2">
          {isExtras ? (
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
          priorityCount={isFusion ? 2 : 4}
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
