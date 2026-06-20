"use client";

import Hero from '@/src/components/home/Hero';
import MenuVoucherTabs from '@/src/components/home/MenuVoucherTabs';
import PointsSection from '@/src/components/home/PointsSection';
import ReviewsSection from '@/src/components/home/ReviewsSection';
import BrandCarousel from '@/src/components/home/BrandCarousel';
import VoucherModal from '@/src/components/shared/VoucherModal';
import Footer from '@/src/components/common/Footer';

/** HomePage — composition layer. All logic lives in child components. */
export default function HomePage() {
  return (
    <main className="w-full bg-transparent">
      <h1 className="sr-only">Bạn Cá Bán Matcha — Quán Matcha Chuẩn Nhật Đầu Tiên Tại Thủ Dầu Một, Bình Dương</h1>
      <Hero />
      <MenuVoucherTabs />
      <PointsSection />
      <ReviewsSection />
      <BrandCarousel />
      <Footer />
      {/* VoucherModal lives here so it can be opened from homepage sections */}
      <VoucherModal />
    </main>
  );
}
