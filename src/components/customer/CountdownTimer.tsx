"use client";

import { useState, useEffect } from "react";
import { cn } from "@/src/utils/cn";

interface CountdownTimerProps {
  /** ISO datetime string of the deadline. */
  targetTime: string;
  className?: string;
}

/** Returns seconds remaining until targetTime. Negative = expired. */
function getSecondsRemaining(targetTime: string): number {
  return Math.floor((new Date(targetTime).getTime() - Date.now()) / 1000);
}

/**
 * Countdown timer component for the 20-minute payment window.
 * Colors: neutral → warning (<5 min) → danger (<1 min) → expired.
 */
export function CountdownTimer({ targetTime, className }: CountdownTimerProps) {
  const [seconds, setSeconds] = useState(() => getSecondsRemaining(targetTime));

  useEffect(() => {
    const tick = () => setSeconds(getSecondsRemaining(targetTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  if (seconds <= 0) {
    return (
      <span className={cn("text-red-500 font-semibold text-sm", className)}>
        Hết thời gian thanh toán
      </span>
    );
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const display = `${pad(minutes)}:${pad(secs)}`;

  const colorClass =
    seconds < 60
      ? "text-red-500"
      : seconds < 300
      ? "text-orange-500"
      : "text-foreground";

  return (
    <span className={cn("font-mono font-semibold tabular-nums", colorClass, className)}>
      {display}
    </span>
  );
}
