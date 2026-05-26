"use client";

import VideoHero from '@/src/components/home/VideoHero';
import BrandStorySummary from '@/src/components/home/BrandStorySummary';
import FeaturedProducts from '@/src/components/home/FeaturedProducts';
import EmojiFeed from '@/src/components/home/EmojiFeed';
import Footer from '@/src/components/common/Footer';

export default function HomePage() {

  return (
    <main className="min-h-screen bg-background">
      <h1 className="sr-only">Bạn Cá Bán Matcha — Quán Matcha Chuẩn Nhật Đầu Tiên Tại Thủ Dầu Một, Bình Dương</h1>
      <VideoHero />
      <BrandStorySummary />
      <FeaturedProducts />
      <EmojiFeed />
      <Footer />
    </main>
  );
}
