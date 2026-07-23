"use client";

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Hero from '@/src/components/home/Hero';
import MenuVoucherTabs from '@/src/components/home/MenuVoucherTabs';
import PointsSection from '@/src/components/home/PointsSection';
import ReviewsSection from '@/src/components/home/ReviewsSection';
import BrandCarousel from '@/src/components/home/BrandCarousel';
import VoucherModal from '@/src/components/shared/VoucherModal';
import { fetchMenu } from '@/src/services/menuService';
import { fetchPowders } from '@/src/services/powderService';
import { listActiveVoucherPackages } from '@/src/services/customerVoucherService';
import { usePowderStore } from '@/src/lib/store/powderStore';

/** Homepage composition layer that owns page-level API queries. */
export default function HomePage() {
  const setPowderData = usePowderStore((state) => state.setPowderData);
  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: fetchMenu,
  });
  const { data: powderData } = useQuery({
    queryKey: ["powders"],
    queryFn: fetchPowders,
  });
  const { data: voucherPackages = [], isLoading: packageLoading } = useQuery({
    queryKey: ["voucher_packages"],
    queryFn: listActiveVoucherPackages,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (powderData) setPowderData(powderData);
  }, [powderData, setPowderData]);

  return (
    <main className="w-full bg-transparent -mt-16">
      <style>{`
        html {
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
        }
      `}</style>
      <h1 className="sr-only">Bạn Cá Bán Matcha — Quán Matcha Chuẩn Nhật Đầu Tiên Tại Thủ Dầu Một, Bình Dương</h1>
      <div className="snap-start">
        <Hero />
      </div>
      
      <div className="snap-start min-h-[100svh] flex flex-col">
        <MenuVoucherTabs
          menuData={menuData}
          voucherPackages={voucherPackages}
          menuLoading={menuLoading}
          packageLoading={packageLoading}
        />
      </div>
      
      <div className="snap-start min-h-[100svh] flex flex-col">
        <PointsSection />
      </div>
      
      <div className="snap-start min-h-[100svh] flex flex-col">
        <ReviewsSection />
      </div>
      
      <div className="snap-start min-h-[100svh] flex flex-col">
        <BrandCarousel />
      </div>
      {/* VoucherModal lives here so it can be opened from homepage sections */}
      <VoucherModal />
    </main>
  );
}
