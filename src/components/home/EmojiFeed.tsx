"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import Image from "next/image";

// Manual Instagram SVG to ensure stability across any environment
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" }
  }),
};

// FIX: Updated image paths to include underscores as found in the public directory
const posts = [
  {
    id: 1,
    image: "/image_1.jpg",
    link: "https://www.instagram.com/banhcabonmua"
  },
  {
    id: 2,
    image: "/image_2.jpg",
    link: "https://www.instagram.com/banhcabonmua"
  },
  {
    id: 3,
    image: "/image_3.jpg",
    link: "https://www.instagram.com/banhcabonmua"
  },
  {
    id: 4,
    image: "/image_2.jpg",
    link: "https://www.instagram.com/banhcabonmua"
  },
  {
    id: 5,
    image: "/image_3.jpg",
    link: "https://www.instagram.com/banhcabonmua"
  },
  {
    id: 6,
    image: "/image_1.jpg",
    link: "https://www.instagram.com/banhcabonmua"
  },
];

const EmojiFeed: React.FC = () => {
  return (
    <section className="py-24 px-6 bg-transparent border-t border-primary/10 relative">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-bold text-primary mb-4 text-ink">
            #BạnCáBánMatcha
          </h2>
          <p className="text-primary/60 text-xs md:text-sm uppercase tracking-[0.3em] font-medium text-ink">
            Theo dõi chúng tôi trên Instagram
          </p>
        </motion.div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 md:gap-5">
          {posts.map((post, i) => (
            <motion.a
              key={`${post.id}-${i}`}
              href={post.link}
              target="_blank"
              rel="noopener noreferrer"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={i}
              whileHover={{ rotate: 0, scale: 1.05, zIndex: 10 }}
              className={`relative aspect-square p-2 bg-white shadow-paper card-handmade flex items-center justify-center overflow-hidden cursor-pointer group transition-all duration-300 ${
                i % 2 === 0 ? "rotate-1" : "-rotate-1"
              }`}
            >
              {/* Image Container with inner shadow */}
              <div className="relative w-full h-full rounded-xl overflow-hidden bg-muted border border-primary/5">
                <Image
                  src={post.image}
                  alt="#BạnCáBánMatcha"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  sizes="(max-width: 768px) 33vw, 16vw"
                />

                {/* Instagram Overlay */}
                <div className="absolute inset-0 bg-primary/20 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <InstagramIcon className="w-6 h-6 text-white drop-shadow-lg" />
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EmojiFeed;
