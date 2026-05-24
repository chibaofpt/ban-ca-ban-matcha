"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FeatureCard from '@/src/components/home/FeatureCard';

const cards = [
  { icon: "🍵", label: "Ceremonial Grade", description: "Matcha nguyên chất, không pha tạp", direction: "left" },
  { icon: "🍂", label: "Theo mùa", description: "Menu cập nhật liên tục", direction: "right" },
  { icon: "💸", label: "Từ 25k", description: "Chất lượng không cần đắt", direction: "left" },
];

const IntroSection: React.FC = () => {
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [cardVisible, setCardVisible] = useState<boolean[]>([false, false, false]);

  // Section fade-in animation triggered when the section enters the viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSectionVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // Staggered card animation: Each card is observed and triggered individually
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    cardRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setCardVisible(prev => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
            obs.unobserve(entry.target);
          }
        },
        { threshold: 0.1 }
      );
      obs.observe(ref);
      observers.push(obs);
    });

    return () => observers.forEach(obs => obs.disconnect());
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`relative z-10 bg-background py-24 px-6 md:py-32 transition-all duration-1000 transform
        ${sectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
    >
      <div className="max-w-[680px] mx-auto text-center space-y-12">
        <header className="space-y-4">
          <h2 className="text-xs font-bold tracking-[0.3em] text-primary uppercase">
            Bạn Cá Bán Matcha
          </h2>
          <h1 className="font-serif text-4xl md:text-5xl text-foreground font-bold leading-tight">
            Matcha chuẩn vị – <span className="text-primary italic">Giá không chuẩn</span>
          </h1>
        </header>

        <div className="space-y-6 text-foreground/80 leading-relaxed text-lg">
          <p>
            Tự hào là <strong>quán matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một</strong>, Bạn Cá Bán Matcha mang đến trải nghiệm 
            matcha ceremonial grade nguyên chất từ những vùng trà nổi tiếng của Nhật Bản — vị đắng thanh, màu xanh sâu, không pha tạp. 
            Mỗi ly đều được pha thủ công ngay tại quầy, rót trực tiếp từ chén chawan truyền thống.
          </p>
          <p>
            Menu thay đổi theo mùa để giữ nguyên độ tươi của nguyên liệu. Dù là
            matcha latte đá, matcha sữa nóng hay matcha thuần — bạn luôn có lựa chọn
            chất lượng nhất giữa lòng <strong>Bình Dương</strong> (matcha local Bình Dương).
          </p>
        </div>

        {/* Alternating cards trigger as individual list items by scrolling */}
        <div className="flex flex-col gap-6 pt-8 overflow-hidden">
          {cards.map((card, i) => (
            <div
              key={i}
              ref={el => { cardRefs.current[i] = el; }}
              className={`transition-all duration-1000 ease-out
                ${cardVisible[i] ? 'opacity-100 translate-x-0' :
                  card.direction === 'left' ? 'opacity-0 -translate-x-12' : 'opacity-0 translate-x-12'
                }`}
            >
              <FeatureCard
                icon={card.icon}
                label={card.label}
                description={card.description}
              />
            </div>
          ))}
        </div>

        <div className="pt-10">
          <button
            onClick={() => router.push('/menu')}
            className="bg-primary text-primary-foreground px-10 py-4 rounded-full font-bold 
              transition-all duration-300 hover:scale-105 hover:bg-primary/90 shadow-xl"
          >
            Xem Menu 🐟
          </button>
        </div>
      </div>
    </section>

  );
};

export default IntroSection;
