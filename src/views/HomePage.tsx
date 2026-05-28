"use client";

import Hero from '@/src/components/home/Hero';
import BrandStorySummary from '@/src/components/home/BrandStorySummary';
import FeaturedProducts from '@/src/components/home/FeaturedProducts';
import EmojiFeed from '@/src/components/home/EmojiFeed';
import Footer from '@/src/components/common/Footer';

export default function HomePage() {

  return (
    <main className="w-full bg-transparent">
      <h1 className="sr-only">Bạn Cá Bán Matcha — Quán Matcha Chuẩn Nhật Đầu Tiên Tại Thủ Dầu Một, Bình Dương</h1>
      <Hero />
      <BrandStorySummary />
      <FeaturedProducts />
      <EmojiFeed />
      <Footer />
    </main>
  );
}
