import { useState, useEffect } from "react";

/**
 * Debounce a value by the specified delay.
 * Returns the debounced value that only updates after `delayMs` of inactivity.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
