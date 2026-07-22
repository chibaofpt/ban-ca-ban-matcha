"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, ExternalLink } from "lucide-react";
import rawReviews from "@/src/data/reviews.json";
import { Drawer } from "vaul";
import * as Dialog from "@radix-ui/react-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Review {
  name: string;
  rating: number;
  text: string;
  date: string;
  avatar_initial: string;
}

const REVIEWS = rawReviews as Review[];
const GOOGLE_MAPS_URL = "https://maps.google.com/?cid=ban-ca-ban-matcha";
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

const subscribeToDesktopViewport = (onChange: () => void) => {
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getDesktopSnapshot = () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
const getDesktopServerSnapshot = () => false;

// Pastel avatar colors cycling by index
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-lime-100 text-lime-700",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review, colorCls, truncate = true }: { review: Review; colorCls: string; truncate?: boolean }) {
  const dateObj = new Date(review.date);
  const formattedDate = `tháng ${dateObj.getMonth() + 1} năm ${dateObj.getFullYear()}`;

  return (
    <div className="bg-white/60 backdrop-blur-xs rounded-2xl p-5 shadow-paper border border-primary/10 flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${colorCls}`}>
          {review.avatar_initial}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground leading-tight truncate">{review.name}</p>
          <p className="text-[11px] text-muted-foreground">{formattedDate}</p>
        </div>
        <div className="ml-auto shrink-0">
          <StarRating rating={review.rating} />
        </div>
      </div>
      {/* Text */}
      <p className={`text-sm text-foreground/80 leading-relaxed ${truncate ? "line-clamp-3" : ""}`}>
        {review.text}
      </p>
    </div>
  );
}

// ── Reviews Bottom Sheet ───────────────────────────────────────────────────────

function ReviewsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopViewport,
    getDesktopSnapshot,
    getDesktopServerSnapshot
  );

  const avgRating = useMemo(
    () => (REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length).toFixed(1),
    []
  );

  const modalContent = (
    <div className="relative bg-background w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col h-[85vh] md:max-h-[85vh]">
      {/* Header */}
      <div className="bg-background md:rounded-t-2xl z-10 px-4 pt-2 md:pt-4 pb-3 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-bold text-primary">Đánh giá từ khách hàng</h2>
            <div className="flex items-center gap-2 mt-1">
              <StarRating rating={5} />
              <span className="text-sm font-bold text-foreground">{avgRating}</span>
              <span className="text-sm text-muted-foreground">/ 5 · {REVIEWS.length} đánh giá</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/60 transition text-muted-foreground"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-4 flex flex-col gap-3">
        {REVIEWS.map((review, i) => (
          <ReviewCard
            key={i}
            review={review}
            colorCls={AVATAR_COLORS[i % AVATAR_COLORS.length]}
            truncate={false}
          />
        ))}

        {/* Google Maps CTA */}
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mt-4 mb-6 text-sm font-bold text-primary border border-primary/25 rounded-full py-3 bg-white/60 hover:bg-white transition-colors"
        >
          <span>Xem tất cả trên Google Maps</span>
          <ExternalLink size={15} />
        </a>
      </div>
    </div>
  );

  return (
    <>
      {isDesktop ? (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[40]" />
            <Dialog.Content className="fixed z-[50] outline-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[85vh] max-h-[85vh] flex items-center justify-center p-4">
              {modalContent}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : (
        <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[40]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[50] outline-none bg-background rounded-t-2xl shadow-2xl flex flex-col h-[85vh] max-h-[85vh] after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-inherit">
              <div className="absolute top-0 left-0 right-0 h-10 z-10 flex items-start justify-center pt-3 bg-transparent">
                <div className="w-12 h-1.5 bg-border/60 rounded-full" />
              </div>
              {modalContent}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}

// ── ReviewsSection ─────────────────────────────────────────────────────────────

const AVERAGE_RATING = (REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length).toFixed(1);

/** Homepage reviews section — 3 random reviews, expandable bottom sheet. */
export default function ReviewsSection() {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Use first 3 reviews statically to prevent hydration mismatch (SSR vs Client)
  const featured = useMemo(() => {
    return REVIEWS.slice(0, 3);
  }, []);

  return (
    <section className="py-20 px-4 md:px-6 border-t border-primary/10 bg-transparent relative">
      <div className="max-w-3xl md:max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10"
        >
          <div className="space-y-1.5">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-primary text-ink">
              Khách hàng nói gì?
            </h2>
            <div className="h-1 w-10 bg-accent rounded-full" />
            <div className="flex items-center gap-2 pt-1">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="font-bold text-foreground">{AVERAGE_RATING}</span>
              <span className="text-sm text-muted-foreground">trên Google Maps</span>
            </div>
          </div>
        </motion.div>

        {/* 3 Review cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {featured.map((review, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
            >
              <ReviewCard
                review={review}
                colorCls={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                truncate
              />
            </motion.div>
          ))}
        </div>

        {/* See more */}
        <div className="flex justify-center">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setSheetOpen(true)}
            className="group inline-flex items-center gap-2 font-bold text-sm text-primary border border-primary/25 rounded-full px-7 py-3 bg-white/40 hover:bg-white/70 transition-all shadow-paper card-handmade cursor-pointer"
          >
            <span>Xem thêm đánh giá</span>
            <Star className="w-4 h-4 fill-amber-400 text-amber-400 group-hover:scale-110 transition-transform" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {sheetOpen && <ReviewsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}
