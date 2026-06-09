"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ArrowLeft, Gift } from 'lucide-react';
import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';

import type { MenuData, MenuItem, Category } from '@/src/lib/types/menu';
import { fetchMenu } from '@/src/services/menuService';
import { fetchPowders } from '@/src/services/powderService';
import { usePowderStore } from '@/src/lib/store/powderStore';
import TabBar from '@/src/components/menu/TabBar';
import type { TabId } from '@/src/components/menu/TabBar';
import MenuCard from '@/src/components/menu/MenuCard';
import ProductModal from '@/src/components/menu/ProductModal';
import CartButton from '@/src/components/menu/CartButton';
import CartDrawer from '@/src/components/menu/CartDrawer';
import VoucherModal from '@/src/components/shared/VoucherModal';
import { useVoucherModalStore } from '@/src/lib/store/voucherModalStore';
import { useIsLoggedIn } from '@/src/lib/store/authStore';
import { useCustomerPoints } from '@/src/hooks/useCustomerPoints';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" }
  }),
};

export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<TabId>('latte');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const setPowderData = usePowderStore((s) => s.setPowderData);
  const isLoggedIn = useIsLoggedIn();
  const openVoucherModal = useVoucherModalStore((s) => s.openModal);
  
  const { data: points } = useCustomerPoints();

  const { data: menuRes, isLoading: menuLoading, isError: menuError } = useQuery({
    queryKey: ['menu'],
    queryFn: fetchMenu,
  });

  const { data: powderRes, isLoading: powderLoading, isError: powderError } = useQuery({
    queryKey: ['powders'],
    queryFn: fetchPowders,
  });

  const loading = menuLoading || powderLoading;
  const data = menuRes ?? null;

  // Points are automatically fetched by useCustomerPoints hook
  useEffect(() => {}, [isLoggedIn]);

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

  const filteredItems = useMemo((): MenuItem[] => {
    if (!data) return [];

    if (activeTab === 'seasonal') {
      const allItems = [...(data.latte || []), ...(data.fusion || [])];
      return allItems.filter(item => item.is_seasonal);
    }

    return data[activeTab as Category] ?? [];
  }, [data, activeTab]);

  return (
    <main className="min-h-screen bg-[#fdfcf7] text-foreground font-sans pt-8 pb-32 px-6">
      <div className="max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto">

        {/* Header — 1 row: Back + Title + Voucher button */}
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border border-border/50 text-primary/60 hover:text-primary hover:shadow-md hover:scale-105 transition-all"
            aria-label="Về trang chủ"
          >
            <ArrowLeft className="w-5 h-5 -ml-0.5" />
          </Link>

          <h1 className="font-serif text-2xl md:text-3xl font-bold text-primary">Menu</h1>

          {isLoggedIn ? (
            <button
              id="voucher-modal-trigger-menu"
              onClick={openVoucherModal}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm shadow-orange-500/20 px-3.5 py-2.5 rounded-xl hover:scale-105 transition-transform"
            >
              <Gift size={14} />
              <span>Đổi quà {points !== null && `(${points} 🐟)`}</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
        <p className="text-center text-primary/60 text-sm italic mb-10">Chọn đúng mùa, đúng vị, đúng giá</p>

        {/* Tabs */}
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Menu Grid */}
        <div className="mt-4">
          <AnimatePresence mode="wait">
            {loading ? (
              <div key="loading" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <div key={i} className="aspect-4/3 rounded-4xl bg-secondary/20 animate-pulse" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-24 text-center text-primary/40 space-y-4"
              >
                <span className="text-6xl">🍲</span>
                <p className="font-bold text-lg italic">Không thấy món này...</p>
                <p className="text-sm">Thử tìm tên khác nhé</p>
              </motion.div>
            ) : (
              <motion.div
                key={activeTab}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-6 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8 pb-8"
              >
                {filteredItems.map((item, idx) => (
                  <motion.div key={item.id} variants={fadeUp} custom={idx}>
                    <MenuCard
                      item={item}
                      index={idx}
                      onClick={() => setSelectedItem(item)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {selectedItem && (
        <ProductModal
          key="product-modal-root"
          item={selectedItem}
          latteItems={data?.latte ?? []}
          onClose={() => setSelectedItem(null)}
        />
      )}

      <VoucherModal />
      <CartButton />
      <CartDrawer />
    </main>
  );
}
