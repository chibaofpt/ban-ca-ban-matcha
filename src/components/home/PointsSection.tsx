"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Gift, ArrowRight } from "lucide-react";
import { useIsLoggedIn } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as const },
  }),
};

/** Points system explainer section on the homepage. */
export default function PointsSection() {
  const isLoggedIn = useIsLoggedIn();
  const openRegister = useAuthModalStore((s) => s.openRegister);
  const openVoucherModal = useVoucherModalStore((s) => s.openModal);

  return (
    <section className="py-20 px-4 md:px-6 border-t border-primary/10 bg-transparent relative overflow-hidden">
      {/* Decorative background blob */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/4 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl md:max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={0}
          className="text-center mb-12"
        >
          <p className="text-xs font-bold tracking-[0.3em] text-primary uppercase mb-3">
            Hệ thống tích điểm
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-ink leading-tight">
            Uống matcha, tích cá 🐟
          </h2>
          <p className="text-primary/60 mt-3 text-base">
            Mỗi đơn hàng là một bước gần hơn đến ưu đãi tiếp theo
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {/* Step 1 */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={1}
            className="bg-white/50 backdrop-blur-xs rounded-3xl p-6 shadow-paper border border-primary/10 card-handmade flex gap-4 items-start"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary/60 mb-1">Bước 1</p>
              <h3 className="font-serif text-lg font-bold text-foreground text-ink leading-tight mb-2">
                Mua hàng tại quán
              </h3>
              <div className="inline-flex items-center gap-2 bg-primary/8 rounded-full px-4 py-1.5 border border-primary/15">
                <span className="font-black text-primary text-base">10,000đ</span>
                <span className="text-primary/60 text-sm">=</span>
                <span className="font-black text-primary text-base">1 🐟</span>
              </div>
            </div>
          </motion.div>

          {/* Step 2 */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={2}
            className="bg-white/50 backdrop-blur-xs rounded-3xl p-6 shadow-paper border border-primary/10 card-handmade flex gap-4 items-start"
          >
            <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-accent/70 mb-1">Bước 2</p>
              <h3 className="font-serif text-lg font-bold text-foreground text-ink leading-tight mb-2">
                Đổi 🐟 lấy quà
              </h3>
              <p className="text-sm text-primary/70 leading-relaxed">
                Tích đủ điểm, đổi ngay voucher giảm giá hoặc đồ uống miễn phí từ quán.
              </p>
            </div>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={3}
          className="flex justify-center"
        >
          <button
            onClick={isLoggedIn ? openVoucherModal : openRegister}
            className="group inline-flex items-center gap-2.5 bg-primary text-white font-bold rounded-full shadow-paper card-handmade px-8 py-3.5 text-base hover:-translate-y-1 hover:shadow-xl transition-all duration-300 cursor-pointer"
          >
            <span>
              {isLoggedIn ? "Xem ưu đãi có thể đổi" : "Đăng ký để bắt đầu tích điểm"}
            </span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform shrink-0" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
