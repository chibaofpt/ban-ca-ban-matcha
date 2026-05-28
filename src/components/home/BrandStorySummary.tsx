import React from 'react';
import Link from 'next/link';

const BrandStorySummary: React.FC = () => {
  return (
    <section className="bg-transparent py-24 px-6 md:py-32 border-t border-primary/10 relative">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12">
        {/* Handmade card placeholder */}
        <div className="w-full md:w-1/2 aspect-[4/3] bg-white/40 backdrop-blur-xs rounded-3xl overflow-hidden relative shadow-paper card-handmade flex items-center justify-center group hover:scale-[1.01] transition-transform duration-500">
          <div className="absolute -top-3 -right-3 w-12 h-5 bg-white/60 backdrop-blur-xs border border-black/5 rotate-12 opacity-60 pointer-events-none" />
          <span className="text-8xl transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">🍵</span>
        </div>
        <div className="w-full md:w-1/2 space-y-6">
          <h2 className="text-xs font-bold tracking-[0.3em] text-primary uppercase">Câu Chuyện Tiên Phong</h2>
          <h3 className="font-serif text-3xl md:text-4xl font-bold text-foreground leading-tight text-ink">
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
              className="inline-flex items-center gap-2 font-bold text-primary hover:text-primary/80 transition-colors group card-handmade px-6 py-3 border border-primary/15 rounded-full bg-white/20 hover:bg-white/40 shadow-xs"
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
