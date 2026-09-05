import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/src/utils/cn";

interface OptionCardProps {
  label: string;
  meta?: string;
  sub?: string;
  isActive: boolean;
  onClick: () => void;
  imageUrl?: string | null;
  imageAlt?: string;
  /** Use "lg" for larger text (e.g. size selector). */
  size?: "default" | "lg";
  /** Use "stacked" for name-on-top, image+price row below (e.g. base liquid, topping). */
  layout?: "default" | "stacked";
}

function OptionCard({ label, meta, sub, isActive, onClick, imageUrl, imageAlt, size = "default", layout = "default" }: OptionCardProps) {
  const isPriceAddition = sub?.startsWith("+");
  const isLg = size === "lg";
  const isStacked = layout === "stacked";

  if (isStacked) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.92 }}
        className={cn(
          "flex min-h-12 min-w-0 flex-col items-stretch rounded-2xl border-2 p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isActive ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:border-primary/30"
        )}
      >
        {/* Row 1: label */}
        <span className={cn("text-sm font-bold leading-tight", isActive ? "text-primary" : "text-primary/80")}>{label}</span>
        {/* Row 2: image + price side-by-side */}
        {(imageUrl || sub) && (
          <span className="mt-2 flex items-center gap-2">
            {imageUrl && (
              <Image
                src={imageUrl}
                alt={imageAlt ?? "Ảnh tuỳ chọn"}
                width={32}
                height={32}
                sizes="32px"
                quality={60}
                loading="lazy"
                className="h-8 w-8 shrink-0 rounded-sm object-cover"
              />
            )}
            {sub && (
              <span
                className={cn(
                  "text-xs",
                  isPriceAddition
                    ? "font-semibold text-[#c74646]"
                    : cn("font-semibold", isActive ? "text-primary" : "text-primary/70")
                )}
              >
                {sub}
              </span>
            )}
          </span>
        )}
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "flex min-h-12 min-w-0 items-center justify-center rounded-2xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isLg ? "px-3 py-2" : "p-2",
        imageUrl ? "gap-2 text-left" : "flex-col text-center",
        isActive ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:border-primary/30"
      )}
    >
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={imageAlt ?? "Ảnh tuỳ chọn"}
          width={32}
          height={32}
          sizes="32px"
          quality={60}
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded-sm object-cover"
        />
      )}
      <span className={cn("min-w-0", imageUrl ? "flex flex-col" : "contents")}>
        <span className={cn("font-bold leading-tight", isLg ? "text-base" : "text-sm", isActive ? "text-primary" : "text-primary/80")}>{label}</span>
        {meta && (
          <span className={cn("font-medium", isLg ? "text-sm" : "text-xs", imageUrl ? "" : "mt-1", isActive ? "text-primary/70" : "text-primary/60")}>
            {meta}
          </span>
        )}
        {sub && (
          <span
            className={cn(
              isLg ? "text-base" : "text-xs",
              imageUrl ? "" : "mt-1",
              isPriceAddition
                ? "font-semibold text-[#c74646]"
                : cn("font-semibold", isActive ? "text-primary" : "text-primary/70")
            )}
          >
            {sub}
          </span>
        )}
      </span>
    </motion.button>
  );
}
export default React.memo(OptionCard);
