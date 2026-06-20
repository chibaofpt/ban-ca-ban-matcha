"use client";

/**
 * Dev-only render profiling utilities.
 * All functions are no-ops in production — tree-shaken by bundler.
 *
 * Usage:
 *   import { onRenderCallback, useRenderCount } from "@/src/utils/dev/renderProfiler";
 */

import { useRef, useEffect, useCallback, type ProfilerOnRenderCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────

interface RenderEntry {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

interface RenderStats {
  componentId: string;
  totalRenders: number;
  mounts: number;
  updates: number;
  avgActualMs: number;
  maxActualMs: number;
  p95ActualMs: number;
  avgBaseMs: number;
  history: RenderEntry[];
}

// ─── Shared store (dev only) ──────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";

/** In-memory store of render entries, keyed by Profiler id */
const renderStore = new Map<string, RenderEntry[]>();

// ─── React <Profiler> callback ────────────────────────────────────

/**
 * Plug this into `<Profiler id="CartDrawer" onRender={onRenderCallback}>`.
 * Collects render timing data in dev, no-op in prod.
 */
export const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!isDev) return;

  const entry: RenderEntry = {
    id,
    phase: phase as RenderEntry["phase"],
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  };

  const existing = renderStore.get(id) ?? [];
  existing.push(entry);
  // Keep last 200 entries per component
  if (existing.length > 200) existing.shift();
  renderStore.set(id, existing);

  // Color-code by severity
  const color =
    actualDuration > 16
      ? "color: #ff4444; font-weight: bold"  // > 1 frame = red
      : actualDuration > 8
        ? "color: #ffaa00"                     // > 0.5 frame = orange
        : "color: #44bb44";                    // fast = green

  console.log(
    `%c⚡ [${id}] ${phase} — ${actualDuration.toFixed(2)}ms (base: ${baseDuration.toFixed(2)}ms)`,
    color,
  );
};

// ─── useRenderCount ───────────────────────────────────────────────

/**
 * Counts how many times a component re-renders. Dev only.
 *
 * ```tsx
 * const renderCount = useRenderCount("CartDrawer");
 * // renderCount.current = number of renders
 * ```
 */
export function useRenderCount(label: string) {
  const count = useRef(0);

  if (isDev) {
    count.current += 1;

    // Log every 5th render to avoid console spam
    if (count.current % 5 === 0) {
      console.log(
        `%c🔄 [${label}] rendered ${count.current} times`,
        "color: #888; font-style: italic",
      );
    }
  }

  return count;
}

// ─── useRenderTiming ──────────────────────────────────────────────

/**
 * Measures the wall-clock time of each render cycle using Performance API.
 * More granular than Profiler — includes useEffect/layout effects.
 *
 * ```tsx
 * useRenderTiming("ProductModal");
 * ```
 */
export function useRenderTiming(label: string) {
  const renderStart = useRef(0);

  if (isDev) {
    // Mark render start (runs during render phase)
    renderStart.current = performance.now();
  }

  useEffect(() => {
    if (!isDev) return;

    const renderEnd = performance.now();
    const duration = renderEnd - renderStart.current;

    if (duration > 16) {
      console.warn(
        `%c🐌 [${label}] render + effects: ${duration.toFixed(2)}ms (> 16ms budget!)`,
        "color: #ff4444; font-weight: bold",
      );
    }

    // Performance marks for Chrome DevTools timeline
    performance.mark(`${label}-render-end`);
    try {
      performance.measure(`${label}-render`, {
        start: renderStart.current,
        end: renderEnd,
      });
    } catch {
      // Silently ignore if mark doesn't exist
    }
  });
}

// ─── logRenderStats ───────────────────────────────────────────────

/**
 * Call from browser console: `window.__logRenderStats("CartDrawer")`
 * Prints a summary table of render timings.
 */
function logRenderStats(id?: string) {
  if (!isDev) return;

  const ids = id ? [id] : Array.from(renderStore.keys());

  for (const componentId of ids) {
    const entries = renderStore.get(componentId);
    if (!entries?.length) {
      console.log(`No render data for "${componentId}"`);
      continue;
    }

    const actuals = entries.map((e) => e.actualDuration).sort((a, b) => a - b);
    const bases = entries.map((e) => e.baseDuration);
    const mounts = entries.filter((e) => e.phase === "mount").length;

    const stats: RenderStats = {
      componentId,
      totalRenders: entries.length,
      mounts,
      updates: entries.length - mounts,
      avgActualMs: +(actuals.reduce((s, v) => s + v, 0) / actuals.length).toFixed(2),
      maxActualMs: +actuals[actuals.length - 1].toFixed(2),
      p95ActualMs: +actuals[Math.floor(actuals.length * 0.95)].toFixed(2),
      avgBaseMs: +(bases.reduce((s, v) => s + v, 0) / bases.length).toFixed(2),
      history: entries.slice(-10),
    };

    console.group(`📊 Render Stats: ${componentId}`);
    console.table({
      "Total renders": stats.totalRenders,
      "Mount renders": stats.mounts,
      "Update renders": stats.updates,
      "Avg actual (ms)": stats.avgActualMs,
      "Max actual (ms)": stats.maxActualMs,
      "P95 actual (ms)": stats.p95ActualMs,
      "Avg base (ms)": stats.avgBaseMs,
    });
    console.log("Last 10 renders:", stats.history);
    console.groupEnd();
  }
}

/** Clear stored data for a component (or all) */
function clearRenderStats(id?: string) {
  if (id) {
    renderStore.delete(id);
  } else {
    renderStore.clear();
  }
  console.log(`🗑️ Cleared render stats${id ? ` for ${id}` : ""}`);
}

// ─── Expose to browser console ────────────────────────────────────

if (isDev && typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as unknown as Record<string, unknown>;
  win.__logRenderStats = logRenderStats;
  win.__clearRenderStats = clearRenderStats;
  win.__renderStore = renderStore;
}
