"use client";

import React from "react";
import { motion } from "framer-motion";
import { Leaf, Sun, Coffee, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

const highlights = [
  { icon: Leaf, title: "Ceremonial Grade", desc: "Matcha chuẩn Nhật nhập trực tiếp" },
  { icon: Sun, title: "Đánh Chasen Thủ Công", desc: "Giữ trọn hương vị nguyên bản" },
  { icon: Coffee, title: "Vị ngon mộc mạc", desc: "Trải nghiệm tĩnh lặng, an yên" },
];

export default function Hero() {
  const router = useRouter();

  return (
    <section className="relative w-full h-[calc(100svh-4rem)] overflow-hidden bg-paper flex flex-col justify-between pt-5 md:pt-12 pb-8 md:pb-14 px-4 md:px-8">
      
      {/* 
        Background Image:
        Uses `object-cover` to perfectly fill the section. 
        It naturally crops the height on wider screens, and crops the width on taller screens, 
        ensuring zero empty space while preserving the crispness of the image.
      */}
      <img 
        src="/homepage.png" 
        alt="Bạn Cá Bán Matcha"
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
      />

      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* TOP RIGHT: Highlights vertical list */}
      <div className="relative z-10 w-full flex justify-end">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col gap-4 md:gap-7 max-w-[220px] sm:max-w-[260px] md:max-w-[320px]"
        >
          {highlights.map((item, idx) => (
            <div key={idx} className="flex gap-3 items-start group">
              <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/25 shadow-md shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                <item.icon className="w-4 h-4 md:w-5 md:h-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-sm md:text-lg text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] leading-tight">
                  {item.title}
                </h3>
                <p className="text-[11px] md:text-sm text-white/80 leading-snug mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* BOTTOM CENTER: 2 CTA Buttons 
          Always locked to the bottom of the viewport 
      */}
      <div className="relative z-20 w-full flex justify-center mt-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex flex-row items-center justify-center gap-3 md:gap-6 flex-nowrap"
        >
          {/* Primary: Matcha green paper note */}
          <button
            onClick={() => router.push("/menu")}
            className="group inline-flex items-center justify-center gap-2 bg-primary text-white font-bold rounded-full shadow-paper card-handmade
              px-4 py-2.5 text-[13px] whitespace-nowrap
              sm:px-5 sm:py-3 sm:text-sm
              md:px-8 md:py-4 md:text-lg
              -rotate-1 hover:rotate-0 hover:-translate-y-1 active:translate-y-0.5 hover:shadow-xl transition-all duration-300 cursor-pointer"
          >
            <span>Xem thực đơn 🐟</span>
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform shrink-0" />
          </button>

          {/* Secondary: Ivory washi paper note */}
          <button
            onClick={() => router.push("/about")}
            className="inline-flex items-center justify-center bg-paper text-primary border border-primary/25 font-bold rounded-full shadow-paper card-handmade
              px-4 py-2.5 text-[13px] whitespace-nowrap
              sm:px-5 sm:py-3 sm:text-sm
              md:px-8 md:py-4 md:text-lg
              rotate-1 hover:rotate-0 hover:-translate-y-1 active:translate-y-0.5 hover:shadow-xl transition-all duration-300 cursor-pointer text-ink"
          >
            <span>Câu chuyện tiệm</span>
          </button>
        </motion.div>
      </div>
      
    </section>
  );
}
