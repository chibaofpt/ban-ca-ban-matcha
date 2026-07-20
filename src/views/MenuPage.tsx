"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, PanInfo, useMotionValue, animate, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Gift } from 'lucide-react';
import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';

import type { MenuItem, Category } from '@/src/lib/types/menu';
import { fetchMenu } from '@/src/services/menuService';
import { fetchPowders } from '@/src/services/powderService';
import { usePowderStore } from '@/src/lib/store/powderStore';
import TabBar from '@/src/components/menu/TabBar';
import type { TabId } from '@/src/components/menu/TabBar';
import { tabs as tabsConfig } from '@/src/components/menu/TabBar';
import MenuCard from '@/src/components/menu/MenuCard';
import ProductModal from '@/src/components/shared/ProductModal';
import CartButton from '@/src/components/menu/CartButton';
import CartDrawer from '@/src/components/menu/CartDrawer';
import VoucherModal from '@/src/components/shared/VoucherModal';
import { useVoucherModalStore } from '@/src/lib/store/voucherModalStore';
import { useIsLoggedIn, useIsLoggedInSynced } from '@/src/lib/store/authStore';
import { useCustomerPoints } from '@/src/hooks/useCustomerPoints';
import { useVoucherPackages } from '@/src/hooks/useVoucherPackages';
import { listMyVouchers } from '@/src/services/customerVoucherService';

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<TabId>('latte');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const carouselX = useMotionValue(0);

  const setPowderData = usePowderStore((s) => s.setPowderData);
  const isLoggedIn = useIsLoggedIn();         // UI display — fast, reads from memory
  const isLoggedInSynced = useIsLoggedInSynced(); // API guard — checks has_session cookie
  const openVoucherModal = useVoucherModalStore((s) => s.openModal);
  
  const { data: menuRes, isLoading: menuLoading, isError: menuError } = useQuery({
    queryKey: ['menu'],
    queryFn: fetchMenu,
  });

  const { data: powderRes, isLoading: powderLoading, isError: powderError } = useQuery({
    queryKey: ['powders'],
    queryFn: fetchPowders,
  });

  const isMenuLoaded = !!menuRes && !!powderRes;
  const { data: packagesRes } = useVoucherPackages({ enabled: isMenuLoaded });

  const isPackagesLoaded = !!packagesRes;

  const { data: points } = useCustomerPoints({ enabled: isPackagesLoaded && isLoggedInSynced });

  const { data: vouchersData } = useQuery({
    queryKey: ['my_vouchers'],
    queryFn: listMyVouchers,
    enabled: isPackagesLoaded && isLoggedInSynced,
  });

  const loading = menuLoading || powderLoading;
  const data = menuRes ?? null;



  useEffect(() => {
    if (powderRes) {
      setPowderData(powderRes);
    }
  }, [powderRes, setPowderData]);

  useEffect(() => {
    if (menuError || powderError) {
      console.error("Error fetching menu or powders");
    }
  }, [menuError, powderError]);

  const getItemsForTab = useCallback((tabId: TabId): MenuItem[] => {
    if (!data) return [];
    if (tabId === 'seasonal') {
      const allItems = [...(data.latte || []), ...(data.fusion || [])];
      return allItems.filter(item => item.is_seasonal);
    }
    return data[tabId as Category] ?? [];
  }, [data]);

  const tabsList = tabsConfig.map(t => t.id);
  const currentIndex = tabsList.indexOf(activeTab);

  const snapCarousel = useCallback((index: number) => {
    if (containerRef.current) {
      const W = containerRef.current.offsetWidth;
      animate(carouselX, -index * W, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [carouselX]);

  const handleTabChange = useCallback((newTab: TabId) => {
    setActiveTab(newTab);
  }, []);

  // Sync carousel position when activeTab changes (e.g. from clicks)
  useEffect(() => {
    snapCarousel(currentIndex);
  }, [currentIndex, snapCarousel]);

  // Handle window resize to keep snapped
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const W = containerRef.current.offsetWidth;
        carouselX.set(-currentIndex * W);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, carouselX]);

  const handleDragEnd = useCallback((e: any, { offset, velocity }: PanInfo) => {
    const swipe = swipePower(offset.x, velocity.x);
    const draggedFarLeft = offset.x < -100;
    const draggedFarRight = offset.x > 100;

    if (swipe < -swipeConfidenceThreshold || draggedFarLeft) {
      // Next tab
      if (currentIndex < tabsList.length - 1) setActiveTab(tabsList[currentIndex + 1]);
      else snapCarousel(currentIndex);
    } else if (swipe > swipeConfidenceThreshold || draggedFarRight) {
      // Prev tab
      if (currentIndex > 0) setActiveTab(tabsList[currentIndex - 1]);
      else snapCarousel(currentIndex);
    } else {
      snapCarousel(currentIndex);
    }
  }, [currentIndex, tabsList, snapCarousel]);

  const handleItemClick = useCallback((item: MenuItem) => {
    setSelectedItem(item);
  }, []);

  return (
    <main className="min-h-screen bg-[#fdfcf7] text-foreground font-sans pt-4 pb-24 px-6">
      <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto flex flex-col h-full">

        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border border-border/50 text-primary/60 hover:text-primary hover:shadow-md hover:scale-105 transition-all"
            aria-label="Về trang chủ"
          >
            <ArrowLeft className="w-5 h-5 -ml-0.5" />
          </Link>

          <h1 className="font-serif text-2xl md:text-3xl font-bold text-primary">Menu</h1>

          <button
            onClick={openVoucherModal}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm shadow-orange-500/20 px-3.5 py-2.5 rounded-xl hover:scale-105 transition-transform cursor-pointer"
          >
            <Gift size={14} />
            <span>
              {isLoggedIn
                ? `Đổi quà${points !== null ? ` (${points} cá)` : ''}`
                : 'Ưu đãi'}
            </span>
          </button>
        </div>

        {/* Sync drag position down to TabBar */}
        <TabBar activeTab={activeTab} setActiveTab={handleTabChange} carouselX={carouselX} />

        {/* High-Performance Swipe Area (True Carousel without whileInView) */}
        <div ref={containerRef} className="mt-2 flex-1 relative w-full overflow-hidden">
          {loading ? (
            <div className="flex flex-col gap-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8 w-full">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[130px] w-full bg-secondary/20 animate-pulse rounded-2xl mb-4" />
              ))}
            </div>
          ) : (
            <motion.div
              style={{ x: carouselX }}
              drag="x"
              // Remove bounds constraints so we can rely purely on dragElastic and manual snap for smooth feel
              dragConstraints={{ left: containerRef.current ? -containerRef.current.offsetWidth * 2 : -2000, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="relative w-full touch-pan-y"
            >
              {tabsConfig.map((tab, idx) => {
                const tabItems = getItemsForTab(tab.id);
                const isActive = activeTab === tab.id;
                return (
                  <div 
                    key={tab.id} 
                    className={`w-full pb-8 px-0.5 ${isActive ? "relative" : "absolute top-0"}`}
                    style={{ left: `${idx * 100}%` }}
                  >
                    {tabItems.length === 0 ? (
                      <div className="py-24 text-center text-primary/40 space-y-4 col-span-full">
                        <span className="text-6xl">🍲</span>
                        <p className="font-bold text-lg italic">Không thấy món này...</p>
                        <p className="text-sm">Thử tìm tên khác nhé</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8">
                        {tabItems.map((item, index) => (
                          <MenuCard
                            key={item.id}
                            item={item}
                            milkTypes={data?.milk_types ?? []}
                            addonGroups={data?.addon_groups ?? []}
                            onClick={handleItemClick}
                            priority={index < 4}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedItem && (
          <ProductModal
            key="product-modal-root"
            item={selectedItem}
            latteItems={data?.latte ?? []}
            milkTypes={data?.milk_types ?? []}
            addonGroups={data?.addon_groups ?? []}
            onClose={() => setSelectedItem(null)}
            availableVouchers={vouchersData ?? []}
          />
        )}
      </AnimatePresence>

      <VoucherModal />
      <CartButton />
      {data && powderRes && <CartDrawer menuData={data} powderData={powderRes} />}
    </main>
  );
}
