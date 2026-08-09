import { motion, type MotionValue } from "framer-motion";
import { Leaf } from "lucide-react";
import type { RefObject } from "react";

import MenuCard from "@/src/components/menu/MenuCard";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import { getMenuItemCartInfo } from "@/src/utils/customerUx";

interface MenuPanelsProps {
  carouselX: MotionValue<number>;
  loading: boolean;
  latteItems: MenuItem[];
  fusionItems: MenuItem[];
  seasonalItems: MenuItem[];
  milkTypes: MilkTypeOption[];
  cartItems: CartItem[];
  latteSectionRef: RefObject<HTMLDivElement | null>;
  fusionSectionRef: RefObject<HTMLDivElement | null>;
  onItemClick: (item: MenuItem) => void;
}

interface ItemSectionProps {
  title: "Latte" | "Fusion";
  items: MenuItem[];
  milkTypes: MilkTypeOption[];
  cartItems: CartItem[];
  sectionRef: RefObject<HTMLDivElement | null>;
  onItemClick: (item: MenuItem) => void;
}

/** Renders the combined and seasonal menu panels without owning carousel state. */
export function MenuPanels(props: MenuPanelsProps) {
  const { carouselX, loading, latteItems, fusionItems, seasonalItems } = props;
  return (
    <motion.div style={{ x: carouselX }} className="relative w-full touch-pan-y">
      <div className="w-full pb-8 px-0.5 relative" style={{ left: "0%" }}>
        {loading ? <MenuSkeleton count={6} /> : (
          <>
            <ItemSection
              title="Latte"
              items={latteItems}
              milkTypes={props.milkTypes}
              cartItems={props.cartItems}
              sectionRef={props.latteSectionRef}
              onItemClick={props.onItemClick}
            />
            <ItemSection
              title="Fusion"
              items={fusionItems}
              milkTypes={props.milkTypes}
              cartItems={props.cartItems}
              sectionRef={props.fusionSectionRef}
              onItemClick={props.onItemClick}
            />
          </>
        )}
      </div>
      <div className="w-full pb-8 px-0.5 absolute top-0" style={{ left: "100%" }}>
        <div className="flex gap-3 bg-amber-50 border border-amber-200/60 rounded-2xl p-4 mb-6">
          <Leaf className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            <span className="font-bold block mb-0.5">Seasonal là gì?</span>
            Seasonal là những món có dùng bột matcha hoặc công thức pha sẽ được bán trong 1 thời
            gian giới hạn nên có thể sẽ hết mà không biết trước.
          </p>
        </div>
        {loading ? <MenuSkeleton count={3} /> : seasonalItems.length === 0 ? (
          <div className="py-24 text-center text-primary/40 space-y-4">
            <span className="text-6xl">✨</span>
            <p className="font-bold text-lg italic">Hiện chưa có món seasonal</p>
            <p className="text-sm">Quay lại sau nhé!</p>
          </div>
        ) : (
          <ItemGrid
            items={seasonalItems}
            milkTypes={props.milkTypes}
            cartItems={props.cartItems}
            onItemClick={props.onItemClick}
            priorityCount={4}
          />
        )}
      </div>
    </motion.div>
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
  return (
    <div ref={sectionRef} className={`scroll-mt-24${isFusion ? " mt-8" : ""}`}>
      <div className={`flex items-center gap-3 mb-4${isFusion ? "" : " mt-2"}`}>
        <h2 className="font-serif text-xl font-bold text-[#2d4a22]">{title}</h2>
        <div className="flex-1 h-px bg-primary/10" />
      </div>
      {items.length === 0 ? (
        <div className="py-12 text-center text-primary/40 space-y-2">
          <span className="text-4xl">{isFusion ? "🍲" : "🍵"}</span>
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
