"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

/** Hero section — full-viewport background image with 2 CTA buttons. */
export default function Hero() {
  const router = useRouter();

  return (
    <section className="relative w-full h-[calc(100svh-4rem)] overflow-hidden bg-paper flex flex-col justify-end pt-5 md:pt-12 pb-8 md:pb-14 px-4 md:px-8">

      {/* Background Image */}
      <img
        src="/homepage.png"
        alt="Bạn Cá Bán Matcha"
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
      />

      {/* Overlay Chawan Image */}
      <motion.img
        src="/chawan.png"
        alt="Chawan Bowl"
        className="absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 z-10 w-40 md:w-56 lg:w-64 h-auto pointer-events-none drop-shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: "-45%", x: "-50%" }}
        animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
      />

      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* BOTTOM CENTER: 2 CTA Buttons */}
      <div className="relative z-20 w-full flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex flex-row items-center justify-center gap-3 md:gap-6 flex-nowrap"
        >
          {/* Primary */}
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

          {/* Secondary */}
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
