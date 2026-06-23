"use client";

import Hero from '@/src/components/home/Hero';
import MenuVoucherTabs from '@/src/components/home/MenuVoucherTabs';
import PointsSection from '@/src/components/home/PointsSection';
import ReviewsSection from '@/src/components/home/ReviewsSection';
import BrandCarousel from '@/src/components/home/BrandCarousel';
import VoucherModal from '@/src/components/shared/VoucherModal';

/** HomePage — composition layer. All logic lives in child components. */
export default function HomePage() {
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
        <MenuVoucherTabs />
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
