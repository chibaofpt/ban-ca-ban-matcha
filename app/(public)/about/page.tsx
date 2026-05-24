import React from 'react';
import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Footer from '@/src/components/common/Footer';

export const metadata: Metadata = {
  title: 'Về Chúng Tôi — Bạn Cá Bán Matcha',
  description: 'Câu chuyện về Bạn Cá Bán Matcha - Tiên phong mang văn hóa matcha chuẩn Nhật đầu tiên về Thủ Dầu Một, Bình Dương.',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Bạn Cá Bán Matcha',
  image: '/logo.jpg',
  description: 'Quán trà matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một, Bình Dương. Chuyên phục vụ matcha ceremonial grade pha thủ công bằng chổi chasen.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Thủ Dầu Một',
    addressRegion: 'Bình Dương',
    addressCountry: 'VN'
  },
  url: 'https://ban-ca-ban-matcha.vercel.app/about', 
  servesCuisine: 'Matcha, Trà Nhật Bản, Bánh Cá',
  priceRange: '25,000VND - 100,000VND'
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background pt-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20 space-y-16">
        
        {/* Header Section */}
        <section className="text-center space-y-6">
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-foreground">
            Câu Chuyện Của <span className="text-primary">Bạn Cá</span>
          </h1>
          <p className="text-lg md:text-xl text-foreground/80 max-w-2xl mx-auto leading-relaxed">
            Hành trình mang văn hóa <strong className="text-primary">Matcha chuẩn Nhật đầu tiên về Bình Dương</strong>.
          </p>
        </section>

        {/* Content Section 1 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="font-serif text-3xl font-semibold text-foreground">Tiên Phong Tại Thủ Dầu Một</h2>
            <div className="space-y-4 text-foreground/80 leading-relaxed">
              <p>
                Trước khi Bạn Cá xuất hiện, để thưởng thức một ly matcha đúng nghĩa được đánh bằng chổi chasen từ bột Ceremonial Grade, người Bình Dương thường phải đi rất xa. Chúng tôi tự hào là những người tiên phong, đặt nền móng cho văn hóa matcha nguyên bản tại <strong>Thủ Dầu Một, Bình Dương</strong>.
              </p>
              <p>
                Với danh xưng thân thuộc "Bạn Cá", chúng tôi không chỉ bán một ly nước, mà trao gửi một trải nghiệm văn hóa ẩm thực tinh tế, tĩnh lặng và đầy nghệ thuật.
              </p>
            </div>
          </div>
          <div className="aspect-square bg-muted rounded-2xl overflow-hidden relative shadow-lg flex items-center justify-center">
            {/* Placeholder for real image */}
            <span className="text-6xl">🍵</span>
          </div>
        </section>

        {/* Content Section 2 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center md:flex-row-reverse">
          <div className="space-y-6 md:order-2">
            <h2 className="font-serif text-3xl font-semibold text-foreground">Chất Lượng Lên Tiếng</h2>
            <div className="space-y-4 text-foreground/80 leading-relaxed">
              <p>
                Chúng tôi sử dụng 100% bột Matcha Ceremonial Grade nhập khẩu trực tiếp từ Nhật Bản. Không pha trộn, không sử dụng hương liệu. Bạn sẽ cảm nhận được màu xanh ngọc lục bảo sâu thẳm, hương thơm rong biển nhẹ nhàng và hậu vị ngọt thanh umami đặc trưng.
              </p>
              <p>
                Mỗi ly matcha tại Bạn Cá đều được đánh thủ công ngay tại quầy bằng chổi chasen tre truyền thống. Đó là sự trân trọng nguyên liệu, và sự tôn trọng đối với mỗi vị khách đến với <strong>Matcha Local Bình Dương</strong> của chúng tôi.
              </p>
            </div>
          </div>
          <div className="aspect-square bg-muted rounded-2xl overflow-hidden relative shadow-lg flex items-center justify-center md:order-1">
             {/* Placeholder for real image */}
             <span className="text-6xl">🎋</span>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center py-12 bg-primary/5 rounded-3xl space-y-6">
          <h2 className="font-serif text-3xl font-semibold text-foreground">Trải Nghiệm Sự Khác Biệt</h2>
          <p className="text-foreground/80 max-w-xl mx-auto">
            Hãy ghé thăm Bạn Cá Bán Matcha để tự mình cảm nhận hương vị matcha đích thực giữa lòng Bình Dương.
          </p>
          <div className="pt-4">
            <Link 
              href="/menu"
              className="inline-block bg-primary text-primary-foreground px-8 py-4 rounded-full font-bold transition-transform hover:scale-105 shadow-md"
            >
              Khám Phá Menu
            </Link>
          </div>
        </section>

      </div>
      
      <Footer />
    </main>
  );
}
