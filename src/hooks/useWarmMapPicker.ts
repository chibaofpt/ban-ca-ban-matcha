"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAP_PICKER_WARM_TTL_MS = 45_000;

interface WarmMapPickerLifecycle {
  close: () => void;
  destroy: () => void;
  isMounted: boolean;
  isVisible: boolean;
  open: () => void;
}

/** Keep a hidden map mounted briefly, then release its renderer after the TTL. */
export function useWarmMapPicker(
  ttlMs = MAP_PICKER_WARM_TTL_MS,
): WarmMapPickerLifecycle {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const clearWarmTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const open = useCallback(() => {
    clearWarmTimer();
    setIsMounted(true);
    setIsVisible(true);
  }, [clearWarmTimer]);

  const close = useCallback(() => {
    clearWarmTimer();
    setIsVisible(false);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsMounted(false);
    }, ttlMs);
  }, [clearWarmTimer, ttlMs]);

  const destroy = useCallback(() => {
    clearWarmTimer();
    setIsVisible(false);
    setIsMounted(false);
  }, [clearWarmTimer]);

  useEffect(() => clearWarmTimer, [clearWarmTimer]);

  return { close, destroy, isMounted, isVisible, open };
}
