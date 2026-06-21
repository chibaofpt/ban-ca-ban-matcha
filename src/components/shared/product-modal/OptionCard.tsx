import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/src/utils/cn";

interface OptionCardProps {
  label: string;
  sub?: string;
  isActive: boolean;
  onClick: () => void;
}

function OptionCard({ label, sub, isActive, onClick }: OptionCardProps) {
  const isPriceAddition = sub?.startsWith("+");
  const isSizePrice = sub && sub.endsWith("k") && !sub.startsWith("+") && !sub.startsWith("-");

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 py-3 px-2 text-center transition-all min-w-0 h-full",
        isActive ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:border-primary/30"
      )}
    >
      <span className={cn("text-xs font-bold leading-tight", isActive ? "text-primary" : "text-primary/70")}>{label}</span>
      {sub && (
        <span
          className={cn(
            "text-[10px] mt-0.5",
            isSizePrice
              ? "text-xs text-black"
              : isPriceAddition
                ? "text-[#df5e5e] font-semibold"
                : cn("font-medium", isActive ? "text-primary/60" : "text-primary/40")
          )}
        >
          {sub}
        </span>
      )}
    </motion.button>
  );
}
export default React.memo(OptionCard);
