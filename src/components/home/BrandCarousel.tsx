"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera } from "lucide-react";

/**
 * BrandCarousel — 3 portrait photo placeholders (3:4 ratio) styled as pinned photos.
 * User replaces placeholder divs with <img> when brand story images are ready.
 */
export default function BrandCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const slides = [
    { label: "Ảnh 1", rotate: "-rotate-2" },
    { label: "Ảnh 2", rotate: "rotate-1" },
    { label: "Ảnh 3", rotate: "-rotate-1" },
  ];

  const handleDotClick = (i: number) => {
    setActiveIndex(i);
    if (trackRef.current) {
      const cardWidth = trackRef.current.scrollWidth / slides.length;
      trackRef.current.scrollTo({ left: cardWidth * i, behavior: "smooth" });
    }
  };

  const handleScroll = () => {
    if (!trackRef.current) return;
    const cardWidth = trackRef.current.scrollWidth / slides.length;
    const index = Math.round(trackRef.current.scrollLeft / cardWidth);
    setActiveIndex(Math.max(0, Math.min(index, slides.length - 1)));
  };

  return (
    <section className="py-20 px-4 md:px-6 border-t border-primary/10 bg-transparent relative overflow-hidden">
      {/* Decorative blob */}
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-primary/4 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl md:max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <p className="text-xs font-bold tracking-[0.3em] text-primary uppercase mb-3">
            Câu chuyện thương hiệu
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-ink">
            Bạn Cá Bán Matcha
          </h2>
        </motion.div>

        {/* Carousel track — horizontal scroll snap on mobile, flex centered on desktop */}
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex gap-5 md:gap-8 overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide pb-4 md:justify-center"
          style={{ scrollbarWidth: "none" }}
        >
          {slides.map((slide, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, rotate: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`shrink-0 snap-center ${slide.rotate}`}
              style={{ width: "min(72vw, 240px)" }}
            >
              {/* Tape strip at top */}
              <div className="flex justify-center -mb-3 relative z-10 pointer-events-none">
                <div
                  className="w-12 h-5 rounded-sm opacity-60"
                  style={{
                    background: "rgba(255, 245, 200, 0.85)",
                    border: "1px solid rgba(200, 170, 60, 0.25)",
                    backdropFilter: "blur(2px)",
                  }}
                />
              </div>

              {/* Photo card — 3:4 ratio */}
              <div
                className="relative w-full bg-white shadow-paper border border-primary/10 overflow-hidden"
                style={{ aspectRatio: "3 / 4", padding: "10px 10px 32px 10px" }}
              >
                {/* Inner photo area */}
                <div className="w-full h-full bg-primary/8 rounded-sm flex flex-col items-center justify-center gap-3 border border-primary/10">
                  <Camera className="w-10 h-10 text-primary/30" />
                  <p className="text-xs font-medium text-primary/40 tracking-wide">{slide.label}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => handleDotClick(i)}
              className={`rounded-full transition-all duration-300 cursor-pointer ${
                i === activeIndex
                  ? "w-6 h-2 bg-primary"
                  : "w-2 h-2 bg-primary/30 hover:bg-primary/50"
              }`}
              aria-label={`Ảnh ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
