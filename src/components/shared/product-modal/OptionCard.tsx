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
}

function OptionCard({ label, meta, sub, isActive, onClick, imageUrl, imageAlt }: OptionCardProps) {
  const isPriceAddition = sub?.startsWith("+");

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "flex min-h-12 min-w-0 flex-col items-center justify-center rounded-2xl border-2 px-2 py-3 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isActive ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:border-primary/30"
      )}
    >
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={imageAlt ?? "Ảnh tuỳ chọn"}
          width={48}
          height={48}
          unoptimized
          className="mb-2 h-12 w-12 rounded-xl object-cover"
        />
      )}
      <span className={cn("text-sm font-bold leading-tight", isActive ? "text-primary" : "text-primary/80")}>{label}</span>
      {meta && (
        <span className={cn("mt-1 text-xs font-medium", isActive ? "text-primary/70" : "text-primary/60")}>
          {meta}
        </span>
      )}
      {sub && (
        <span
          className={cn(
            "mt-1 text-xs",
            isPriceAddition
              ? "font-semibold text-[#c74646]"
              : cn("font-semibold", isActive ? "text-primary" : "text-primary/70")
          )}
        >
          {sub}
        </span>
      )}
    </motion.button>
  );
}
export default React.memo(OptionCard);
