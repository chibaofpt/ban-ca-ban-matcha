import React from 'react';
import Link from 'next/link';

const BrandStorySummary: React.FC = () => {
  return (
    <section className="bg-primary/5 py-24 px-6 md:py-32">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12">
        <div className="w-full md:w-1/2 aspect-[4/3] bg-muted rounded-3xl overflow-hidden relative shadow-2xl flex items-center justify-center">
            {/* Placeholder for real brand image */}
            <span className="text-7xl">🍵</span>
        </div>
        <div className="w-full md:w-1/2 space-y-6">
          <h2 className="text-xs font-bold tracking-[0.3em] text-primary uppercase">Câu Chuyện Tiên Phong</h2>
          <h3 className="font-serif text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Matcha Chuẩn Nhật Đầu Tiên Tại Thủ Dầu Một
          </h3>
          <div className="space-y-4 text-foreground/80 leading-relaxed text-lg">
            <p>
              Chúng tôi tự hào là những người đặt nền móng cho văn hóa matcha nguyên bản tại Bình Dương. 
              Mỗi ly matcha tại <strong>Bạn Cá Bán Matcha</strong> đều được sử dụng bột Ceremonial Grade nhập khẩu trực tiếp 
              và đánh thủ công bằng chổi chasen truyền thống.
            </p>
            <p>
              Hơn cả một thức uống, đó là sự tận tâm, là nghệ thuật tĩnh lặng giữa nhịp sống hối hả.
            </p>
          </div>
          <div className="pt-6">
            <Link 
              href="/about"
              className="inline-flex items-center gap-2 font-bold text-primary hover:text-primary/80 transition-colors group"
            >
              <span>Đọc thêm về chúng tôi</span>
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BrandStorySummary;
