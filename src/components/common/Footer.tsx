"use client";

import React from "react";
import { motion } from "framer-motion";

const Footer: React.FC = () => {
  return (
    <footer className="py-24 px-6 bg-[#fdfcf7] border-t border-border">
      <div className="max-w-6xl mx-auto flex flex-col items-center">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           whileInView={{ opacity: 1, y: 0 }}
           viewport={{ once: true }}
           className="text-center"
        >
          <p className="font-serif text-3xl md:text-5xl font-bold text-primary mb-6">
            Bạn Cá Bán Matcha
          </p>
          <div className="h-1 w-12 bg-accent rounded-full mx-auto mb-8" />
          <p className="text-primary/60 text-sm md:text-base mb-2">
            Tiên phong Matcha chuẩn Nhật tại Bình Dương
          </p>
          <a 
            href="https://share.google/lzDys7rVh5d6W41O8"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-accent transition-colors text-sm font-medium mt-2 flex items-center justify-center gap-1"
          >
            <span>📍 Tìm chúng tôi trên Google Maps</span>
          </a>
          <p className="text-primary/40 text-xs mt-12 tracking-widest uppercase">
            © 2026 Bạn Cá Bán Matcha. All rights reserved.
          </p>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
