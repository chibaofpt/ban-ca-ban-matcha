"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, animate, useMotionValue } from "framer-motion";
import { ArrowLeft, Gift } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import CartButton from "@/src/components/menu/CartButton";
import CartDrawer from "@/src/components/menu/CartDrawer";
import { ExistingCartItemSheet } from "@/src/components/menu/ExistingCartItemSheet";
import { MenuPanels } from "@/src/components/menu/MenuPanels";
import TabBar, { type TabId } from "@/src/components/menu/TabBar";
import ProductModal from "@/src/components/shared/ProductModal";
import VoucherModal from "@/src/components/shared/VoucherModal";
import { useCustomerPoints } from "@/src/hooks/useCustomerPoints";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useIsLoggedIn, useIsLoggedInSynced } from "@/src/lib/store/authStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuItem } from "@/src/lib/types/menu";
import { listMyVouchers } from "@/src/services/customerVoucherService";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";

type PanelIndex = 0 | 1;

const TAB_PANEL: Record<TabId, PanelIndex> = {
  latte: 0,
  fusion: 0,
  extras: 0,
  seasonal: 1,
};

/** Displays the customer menu carousel and its cart/voucher interaction layers. */
export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<TabId>("latte");
  const [activePanel, setActivePanel] = useState<PanelIndex>(0);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | undefined>();
  const [existingItemTarget, setExistingItemTarget] = useState<MenuItem | null>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const containerRef = useRef<HTMLDivElement>(null);
  const latteSectionRef = useRef<HTMLDivElement>(null);
  const fusionSectionRef = useRef<HTMLDivElement>(null);
  const extrasSectionRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const carouselX = useMotionValue(0);
  const setPowderData = usePowderStore((state) => state.setPowderData);
  const isLoggedIn = useIsLoggedIn();
  const isLoggedInSynced = useIsLoggedInSynced();
  const openVoucherModal = useVoucherModalStore((state) => state.openModal);
  const cartItems = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const { data: menuRes, isLoading: menuLoading, isError: menuError } = useQuery({
    queryKey: ["menu"],
    queryFn: fetchMenu,
  });
  const { data: powderRes, isLoading: powderLoading, isError: powderError } = useQuery({
    queryKey: ["powders"],
    queryFn: fetchPowders,
  });
  const isMenuLoaded = Boolean(menuRes && powderRes);
  const { data: packagesRes } = useVoucherPackages({ enabled: isMenuLoaded });
  const { data: points } = useCustomerPoints({
    enabled: Boolean(packagesRes) && isLoggedInSynced,
  });
  const { data: vouchersData } = useQuery({
    queryKey: ["my_vouchers"],
    queryFn: listMyVouchers,
    enabled: Boolean(packagesRes) && isLoggedInSynced,
  });

  useEffect(() => {
    if (powderRes) setPowderData(powderRes);
  }, [powderRes, setPowderData]);

  useEffect(() => {
    if (menuError || powderError) console.error("Error fetching menu or powders");
  }, [menuError, powderError]);

  const snapToPanel = useCallback((panel: PanelIndex) => {
    const width = containerRef.current?.offsetWidth ?? containerWidth;
    animate(carouselX, -panel * width, { type: "spring", stiffness: 300, damping: 30 });
  }, [carouselX, containerWidth]);

  const scrollToSection = useCallback((ref: RefObject<HTMLDivElement | null>, delay = 0) => {
    const scroll = () => ref.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    if (delay > 0) setTimeout(scroll, delay);
    else scroll();
  }, []);

  const handleTabChange = useCallback((newTab: TabId) => {
    if (TAB_PANEL[newTab] === 1) {
      if (activePanel !== 1) {
        setActivePanel(1);
        snapToPanel(1);
      }
      setActiveTab("seasonal");
      return;
    }

    setActiveTab(newTab);
    const target = newTab === "extras"
      ? extrasSectionRef
      : newTab === "fusion"
        ? fusionSectionRef
        : latteSectionRef;
    isScrollingProgrammatically.current = true;
    if (activePanel === 1) {
      setActivePanel(0);
      snapToPanel(0);
      scrollToSection(target, 380);
    } else {
      scrollToSection(target);
    }
    setTimeout(() => { isScrollingProgrammatically.current = false; }, 900);
  }, [activePanel, scrollToSection, snapToPanel]);

  useEffect(() => {
    const fusionSection = fusionSectionRef.current;
    const extrasSection = extrasSectionRef.current;
    if (!fusionSection || !extrasSection) return;
    const updateActiveSection = () => {
      if (isScrollingProgrammatically.current || activePanel !== 0) return;
      const stickyOffset = 140;
      if (extrasSection.getBoundingClientRect().top <= stickyOffset) {
        setActiveTab("extras");
      } else if (fusionSection.getBoundingClientRect().top <= stickyOffset) {
        setActiveTab("fusion");
      } else {
        setActiveTab("latte");
      }
    };
    const observer = new IntersectionObserver(updateActiveSection, {
      rootMargin: "-140px 0px 0px 0px",
      threshold: 0,
    });
    observer.observe(extrasSection);
    observer.observe(fusionSection);
    return () => observer.disconnect();
  }, [activePanel]);

  useEffect(() => {
    const handleResize = () => {
      const width = containerRef.current?.offsetWidth;
      if (width) carouselX.set(-activePanel * width);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activePanel, carouselX]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (cartItems.some((cartItem) => cartItem.menuItemId === item.id)) {
      setExistingItemTarget(item);
      return;
    }
    setEditingItem(undefined);
    setSelectedItem(item);
  }, [cartItems]);

  // Derived: only show the sheet when the target item still has cart entries
  const existingCartItemsForTarget = existingItemTarget
    ? cartItems.filter((ci) => ci.menuItemId === existingItemTarget.id)
    : [];
  const showExistingSheet = existingItemTarget !== null && existingCartItemsForTarget.length > 0;

  const data = menuRes ?? null;
  const seasonalItems = [...(data?.latte ?? []), ...(data?.fusion ?? []), ...(data?.extras ?? [])]
    .filter((item) => item.is_seasonal);

  return (
    <main className="min-h-screen bg-[#fdfcf7] text-foreground font-sans pt-4 pb-24 px-6">
      <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto flex flex-col h-full">

        {/* Sticky header + tab bar — always visible */}
        <div className="sticky top-0 z-20 bg-[#fdfcf7]/90 backdrop-blur-md pt-4 -mx-6 px-6 pb-1">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/50 bg-white text-primary/60 shadow-sm transition-transform hover:text-primary hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Về trang chủ">
              <ArrowLeft className="w-5 h-5 -ml-0.5" />
            </Link>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-primary">Menu</h1>
            <button type="button" onClick={openVoucherModal} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-500/20 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">
              <Gift size={14} />
              <span>{isLoggedIn ? `Đổi quà${typeof points === "number" ? ` (${points} cá)` : ""}` : "Ưu đãi"}</span>
            </button>
          </div>
          <TabBar activeTab={activeTab} setActiveTab={handleTabChange} />
        </div>

        <div ref={containerRef} className="flex-1 relative w-full overflow-hidden">
          <MenuPanels
            carouselX={carouselX}
            loading={menuLoading || powderLoading}
            latteItems={data?.latte ?? []}
            fusionItems={data?.fusion ?? []}
            extrasItems={data?.extras ?? []}
            seasonalItems={seasonalItems}
            milkTypes={data?.milk_types ?? []}
            cartItems={cartItems}
            latteSectionRef={latteSectionRef}
            fusionSectionRef={fusionSectionRef}
            extrasSectionRef={extrasSectionRef}
            onItemClick={handleItemClick}
          />
        </div>
      </div>

      <AnimatePresence>
        {selectedItem && <ProductModal
          key="product-modal-root"
          item={selectedItem}
          latteItems={data?.latte ?? []}
          milkTypes={data?.milk_types ?? []}
          addonGroups={data?.addon_groups ?? []}
          onClose={() => setSelectedItem(null)}
          editingItem={editingItem}
          availableVouchers={vouchersData ?? []}
        />}
      </AnimatePresence>
      {showExistingSheet && existingItemTarget && <ExistingCartItemSheet
        itemName={existingItemTarget.name}
        items={existingCartItemsForTarget}
        addonGroups={data?.addon_groups ?? []}
        milkTypes={data?.milk_types ?? []}
        powders={powderRes?.data ?? []}
        onClose={() => setExistingItemTarget(null)}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onAddNew={() => {
          setEditingItem(undefined);
          setSelectedItem(existingItemTarget);
          setExistingItemTarget(null);
        }}
        onEdit={(cartItem) => {
          setEditingItem(cartItem);
          setSelectedItem(existingItemTarget);
          setExistingItemTarget(null);
        }}
      />}
      <VoucherModal />
      <CartButton />
      {data && powderRes && <CartDrawer menuData={data} powderData={powderRes} />}
    </main>
  );
}
