"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
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
  const isScrollingProgrammatically = useRef(false);
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

  const scrollToSection = useCallback((ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const handleTabChange = useCallback((newTab: TabId) => {
    setActiveTab(newTab);
    isScrollingProgrammatically.current = true;
    const refMap: Record<TabId, RefObject<HTMLDivElement | null>> = {
      latte: latteSectionRef,
      fusion: fusionSectionRef,
      extras: extrasSectionRef,
      seasonal: seasonalSectionRef,
    };
    scrollToSection(refMap[newTab]);
    setTimeout(() => { isScrollingProgrammatically.current = false; }, 900);
  }, [scrollToSection]);

  useEffect(() => {
    const fusionSection = fusionSectionRef.current;
    const extrasSection = extrasSectionRef.current;
    const seasonalSection = seasonalSectionRef.current;
    if (!fusionSection || !extrasSection || !seasonalSection) return;
    const updateActiveSection = () => {
      if (isScrollingProgrammatically.current) return;
      const stickyOffset = 140;
      if (seasonalSection.getBoundingClientRect().top <= stickyOffset) {
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
    <main className="min-h-screen bg-[#fdfcf7] px-4 pb-24 font-sans text-foreground sm:px-6">

      {/* Sticky header + tab bar — direct child of <main>, no h-full ancestor, so sticky sticks on window scroll */}
      <div className="sticky top-0 z-20 -mx-4 bg-[#fdfcf7]/90 px-4 pb-1 pt-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link href="/home" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/50 bg-white text-primary/60 shadow-sm transition-transform hover:text-primary hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Về trang chủ">
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
      </div>

      {/* Content — separate from sticky header, scrolls normally */}
      <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto pt-4">
        <div className="relative w-full">
          <MenuPanels
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
