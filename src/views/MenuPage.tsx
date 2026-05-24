"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

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
import { Skeleton } from '@/src/components/ui/skeleton';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" }
  }),
};

export default function MenuPage() {
  const router = useRouter();
  const [data, setData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('latte');

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const setPowderData = usePowderStore((s) => s.setPowderData);

  useEffect(() => {
    Promise.all([fetchMenu(), fetchPowders()])
      .then(([menuRes, powderRes]) => {
        console.log("DEBUG: GET /api/menu response:", menuRes);
        setData(menuRes);
        setPowderData(powderRes);
      })
      .catch((error) => console.error("Error fetching menu or powders:", error))
      .finally(() => setLoading(false));
  }, [setPowderData]);

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
      <div className="max-w-2xl mx-auto">

        {/* Back Button */}
        <div className="">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border border-border/50 text-primary/60 hover:text-primary hover:shadow-md hover:scale-105 transition-all"
            aria-label="Về trang chủ"
          >
            <ArrowLeft className="w-5 h-5 -ml-0.5" />
          </Link>
        </div>

        {/* Header - Match Image 3 */}
        <div className="text-center mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-primary mb-2">Menu</h1>
          <p className="text-primary/60 text-sm italic">Chọn đúng mùa, đúng vị, đúng giá</p>
        </div>

        {/* Search Bar - Removed */}


        {/* Tabs - Now using restored TabBar */}
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Menu Grid - Match Image 2/3 */}
        <div className="mt-4">
          <AnimatePresence mode="wait">
            {loading ? (
              <div key="loading" className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
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
                className="grid grid-cols-2 gap-4 md:gap-6"
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

      <CartButton />
      <CartDrawer />
    </main>
  );
}
