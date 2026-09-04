"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { Gift } from "lucide-react";
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
import { VOUCHER_QUERY_KEYS } from "@/src/constants/voucherQueryKeys";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuItem } from "@/src/lib/types/menu";
import { listMyVouchers } from "@/src/services/customerVoucherService";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";

/** Displays the customer menu with sticky tabs and section navigation. */
export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<TabId>("latte");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | undefined>();
  const [existingItemTarget, setExistingItemTarget] = useState<MenuItem | null>(null);
  const latteSectionRef = useRef<HTMLDivElement | null>(null);
  const fusionSectionRef = useRef<HTMLDivElement | null>(null);
  const extrasSectionRef = useRef<HTMLDivElement | null>(null);
  const seasonalSectionRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const isScrollingProgrammatically = useRef(false);
  /** Tab selected via tap — held until user scrolls enough to prevent jitter. */
  const programmaticTab = useRef<TabId | null>(null);
  const scrollYAtSettle = useRef(0);

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
  const isMenuContentLoading = menuLoading || powderLoading;
  const isMenuLoaded = Boolean(menuRes && powderRes);
  const { data: packagesRes } = useVoucherPackages({ enabled: isMenuLoaded });
  const { data: points } = useCustomerPoints({
    enabled: Boolean(packagesRes) && isLoggedInSynced,
  });
  const { data: vouchersData } = useQuery({
    queryKey: VOUCHER_QUERY_KEYS.CUSTOMER_VOUCHERS,
    queryFn: listMyVouchers,
    enabled: Boolean(packagesRes) && isLoggedInSynced,
  });

  useEffect(() => {
    if (powderRes) setPowderData(powderRes);
  }, [powderRes, setPowderData]);

  useEffect(() => {
    if (menuError || powderError) console.error("Error fetching menu or powders");
  }, [menuError, powderError]);

  const scrollToSection = useCallback((ref: RefObject<HTMLDivElement | null>) => {
    const el = ref.current;
    if (!el) return;
    const headerH = stickyHeaderRef.current?.getBoundingClientRect().height ?? 148;
    const elTop = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: elTop - headerH - 4, // 4px breathing room below header
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);

  const handleTabChange = useCallback((newTab: TabId) => {
    setActiveTab(newTab);
    programmaticTab.current = newTab;

    isScrollingProgrammatically.current = true;
    const refMap: Record<TabId, RefObject<HTMLDivElement | null>> = {
      latte: latteSectionRef,
      fusion: fusionSectionRef,
      extras: extrasSectionRef,
      seasonal: seasonalSectionRef,
    };
    window.requestAnimationFrame(() => scrollToSection(refMap[newTab]));
    setTimeout(() => {
      isScrollingProgrammatically.current = false;
      scrollYAtSettle.current = window.scrollY;
    }, 900);
  }, [scrollToSection]);


  useEffect(() => {
    const fusionSection = fusionSectionRef.current;
    const extrasSection = extrasSectionRef.current;
    const seasonalSection = seasonalSectionRef.current;
    if (!fusionSection || !extrasSection) return;
    const updateActiveSection = () => {
      if (isScrollingProgrammatically.current) return;

      // After programmatic scroll, hold the selected tab until user scrolls
      // ≥ 20 px from the settled position to prevent jitter caused by
      // interrupted smooth-scroll animations.
      if (programmaticTab.current !== null) {
        if (Math.abs(window.scrollY - scrollYAtSettle.current) < 20) return;
        programmaticTab.current = null;
      }

      const stickyOffset = (stickyHeaderRef.current?.getBoundingClientRect().height ?? 148) + 8;
      if (seasonalSection && seasonalSection.getBoundingClientRect().top <= stickyOffset) {
        setActiveTab("seasonal");
      } else if (extrasSection.getBoundingClientRect().top <= stickyOffset) {
        setActiveTab("extras");
      } else if (fusionSection.getBoundingClientRect().top <= stickyOffset) {
        setActiveTab("fusion");
      } else {
        setActiveTab("latte");
      }
    };
    let animationFrameId: number | null = null;
    const handleScroll = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        updateActiveSection();
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, [isMenuContentLoading]);

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
    <main className="min-h-screen touch-pan-y overflow-x-clip overscroll-x-none bg-[#fdfcf7] px-2 pb-24 font-sans text-foreground sm:px-6">

      {/* Sticky header + tab bar — direct child of <main>, no h-full ancestor, so sticky sticks on window scroll */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-20 -mx-2 bg-[#fdfcf7]/90 px-2 pb-1 pt-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto">
          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center">
            <h1 className="col-start-2 font-serif text-2xl font-bold text-primary md:text-3xl">Menu</h1>
            <button type="button" onClick={openVoucherModal} className="col-start-3 flex min-h-11 cursor-pointer items-center justify-self-end gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-500/20 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">
              <Gift size={14} />
              <span>{isLoggedIn ? `Đổi quà${typeof points === "number" ? ` (${points} cá)` : ""}` : "Ưu đãi"}</span>
            </button>
          </div>
          <TabBar activeTab={activeTab} setActiveTab={handleTabChange} />
        </div>
      </div>

      {/* Content — separate from sticky header, scrolls normally */}
      <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto pt-4">
        <div className="relative w-full">
          <MenuPanels
            loading={isMenuContentLoading}
            latteItems={data?.latte ?? []}
            fusionItems={data?.fusion ?? []}
            extrasItems={data?.extras ?? []}
            seasonalItems={seasonalItems}
            milkTypes={data?.milk_types ?? []}
            cartItems={cartItems}
            latteSectionRef={latteSectionRef}
            fusionSectionRef={fusionSectionRef}
            extrasSectionRef={extrasSectionRef}
            seasonalSectionRef={seasonalSectionRef}
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
