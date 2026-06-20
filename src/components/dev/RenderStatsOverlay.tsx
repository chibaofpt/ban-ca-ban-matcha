"use client";

/**
 * Dev-only floating overlay that shows real-time render stats.
 * Renders a small draggable panel in the bottom-right corner.
 *
 * Usage (in layout or page, dev only):
 *   {process.env.NODE_ENV === "development" && <RenderStatsOverlay componentIds={["CartDrawer", "ProductModal", "MenuPage"]} />}
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface OverlayProps {
  /** Profiler IDs to track. Must match the id prop on <Profiler> wrappers. */
  componentIds: string[];
  /** Poll interval in ms. Default 1000. */
  pollInterval?: number;
}

interface ComponentStats {
  id: string;
  renders: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
  lastPhase: string;
}

/** Dev-only floating render stats panel */
export function RenderStatsOverlay({ componentIds, pollInterval = 1000 }: OverlayProps) {
  const [stats, setStats] = useState<ComponentStats[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const pollStats = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as unknown as Record<string, unknown>).__renderStore as Map<string, Array<{ actualDuration: number; phase: string }>> | undefined;
    if (!store) return;

    const result: ComponentStats[] = componentIds.map((id) => {
      const entries = store.get(id);
      if (!entries?.length) {
        return { id, renders: 0, avgMs: 0, maxMs: 0, lastMs: 0, lastPhase: "-" };
      }
      const actuals = entries.map((e) => e.actualDuration);
      const last = entries[entries.length - 1];
      return {
        id,
        renders: entries.length,
        avgMs: +(actuals.reduce((s, v) => s + v, 0) / actuals.length).toFixed(1),
        maxMs: +Math.max(...actuals).toFixed(1),
        lastMs: +last.actualDuration.toFixed(1),
        lastPhase: last.phase,
      };
    });

    setStats(result);
  }, [componentIds]);

  useEffect(() => {
    const interval = setInterval(pollStats, pollInterval);
    pollStats(); // initial poll
    return () => clearInterval(interval);
  }, [pollStats, pollInterval]);

  /** Drag handlers */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, posX: position.x, posY: position.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({ x: dragRef.current.posX - dx, y: dragRef.current.posY - dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  /** Color for ms value */
  const msColor = (ms: number): string => {
    if (ms > 16) return "#ff4444";
    if (ms > 8) return "#ffaa00";
    return "#44bb44";
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: position.y,
        right: position.x,
        zIndex: 99999,
        fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
        fontSize: 11,
        background: "rgba(0, 0, 0, 0.88)",
        color: "#e0e0e0",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(8px)",
        minWidth: isCollapsed ? 40 : 300,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        userSelect: "none",
      }}
    >
      {/* Header — draggable */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          cursor: "grab",
          borderBottom: isCollapsed ? "none" : "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <span style={{ fontWeight: 600 }}>⚡ Render</span>
        <button
          onClick={() => setIsCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 2px",
          }}
        >
          {isCollapsed ? "▲" : "▼"}
        </button>
      </div>

      {/* Stats table */}
      {!isCollapsed && (
        <div style={{ padding: "4px 8px 8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#888", fontSize: 10, textAlign: "left" }}>
                <th style={{ padding: "2px 4px" }}>Component</th>
                <th style={{ padding: "2px 4px", textAlign: "right" }}>#</th>
                <th style={{ padding: "2px 4px", textAlign: "right" }}>Avg</th>
                <th style={{ padding: "2px 4px", textAlign: "right" }}>Max</th>
                <th style={{ padding: "2px 4px", textAlign: "right" }}>Last</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: "2px 4px", whiteSpace: "nowrap" }}>
                    {s.id}
                  </td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>
                    {s.renders}
                  </td>
                  <td style={{ padding: "2px 4px", textAlign: "right", color: msColor(s.avgMs) }}>
                    {s.avgMs}
                  </td>
                  <td style={{ padding: "2px 4px", textAlign: "right", color: msColor(s.maxMs) }}>
                    {s.maxMs}
                  </td>
                  <td style={{ padding: "2px 4px", textAlign: "right", color: msColor(s.lastMs) }}>
                    {s.lastMs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Actions */}
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fn = (window as unknown as Record<string, unknown>).__clearRenderStats as ((id?: string) => void) | undefined;
                fn?.();
                pollStats();
              }}
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#ccc",
                border: "none",
                borderRadius: 4,
                padding: "3px 8px",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              🗑️ Clear
            </button>
            <button
              onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fn = (window as unknown as Record<string, unknown>).__logRenderStats as ((id?: string) => void) | undefined;
                fn?.();
              }}
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#ccc",
                border: "none",
                borderRadius: 4,
                padding: "3px 8px",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              📊 Console
            </button>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 4, fontSize: 9, color: "#666" }}>
            <span style={{ color: "#44bb44" }}>●</span> &lt;8ms{" "}
            <span style={{ color: "#ffaa00" }}>●</span> 8-16ms{" "}
            <span style={{ color: "#ff4444" }}>●</span> &gt;16ms (jank)
          </div>
        </div>
      )}
    </div>
  );
}
