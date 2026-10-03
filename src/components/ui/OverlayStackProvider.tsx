"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type OverlayLayer = "base" | "nested" | "critical";
type Registration = { layer: OverlayLayer; order: number };
interface OverlayStackContextValue { register: (id: string, layer: OverlayLayer) => void; unregister: (id: string) => void; }
interface OverlayStackSnapshot { topId: string | null; zIndexById: ReadonlyMap<string, number>; }
export interface OverlayParentScopeValue { ownerId: string; supportsNestedDrawer: boolean; }

const OverlayStackContext = createContext<OverlayStackContextValue | null>(null);
const OverlayStackSnapshotContext = createContext<OverlayStackSnapshot>({ topId: null, zIndexById: new Map() });
const OverlayParentScopeContext = createContext<OverlayParentScopeValue | null>(null);
const LAYER_PRIORITY: Record<OverlayLayer, number> = { base: 1, nested: 2, critical: 3 };
const LAYER_Z_BANDS: Record<OverlayLayer, number> = { base: 40, nested: 90, critical: 190 };
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function buildSnapshot(registrations: Map<string, Registration>): OverlayStackSnapshot {
  const sorted = [...registrations.entries()].sort(([, left], [, right]) => (
    LAYER_PRIORITY[left.layer] - LAYER_PRIORITY[right.layer] || left.order - right.order
  ));
  const zIndexById = new Map<string, number>();
  const indexes: Record<OverlayLayer, number> = { base: 0, nested: 0, critical: 0 };
  sorted.forEach(([id, { layer }]) => { const index = indexes[layer]++; zIndexById.set(id, LAYER_Z_BANDS[layer] + index * 2); });
  return { topId: sorted.at(-1)?.[0] ?? null, zIndexById };
}

/** Coordinates open overlays by semantic layer and latest registration order. */
export function OverlayStackProvider({ children }: { children: ReactNode }) {
  const registrations = useRef(new Map<string, Registration>());
  const nextOrder = useRef(0);
  const [snapshot, setSnapshot] = useState<OverlayStackSnapshot>(() => buildSnapshot(new Map()));
  const refresh = useCallback(() => setSnapshot(buildSnapshot(registrations.current)), []);
  const register = useCallback((id: string, layer: OverlayLayer) => {
    const current = registrations.current.get(id);
    if (current) {
      if (current.layer !== layer) {
        registrations.current.set(id, { ...current, layer });
        refresh();
      }
      return;
    }
    registrations.current.set(id, { layer, order: ++nextOrder.current });
    refresh();
  }, [refresh]);
  const unregister = useCallback((id: string) => {
    if (!registrations.current.delete(id)) return;
    refresh();
  }, [refresh]);
  const value = useMemo<OverlayStackContextValue>(() => ({
    register,
    unregister,
  }), [register, unregister]);
  return (
    <OverlayStackContext.Provider value={value}>
      <OverlayStackSnapshotContext.Provider value={snapshot}>{children}</OverlayStackSnapshotContext.Provider>
    </OverlayStackContext.Provider>
  );
}

/** Provides the owning overlay scope to descendants rendered through a portal. */
export function OverlayStackScope({
  ownerId,
  supportsNestedDrawer,
  children,
}: OverlayParentScopeValue & { children: ReactNode }) {
  const value = useMemo(() => ({ ownerId, supportsNestedDrawer }), [ownerId, supportsNestedDrawer]);
  return <OverlayParentScopeContext.Provider value={value}>{children}</OverlayParentScopeContext.Provider>;
}

/** Registers one open primitive and reports whether it is currently dismissible. */
export function useOverlayRegistration(layer: OverlayLayer, open: boolean, options: { deferRelease?: boolean } = {}) {
  const stack = useContext(OverlayStackContext);
  const snapshot = useContext(OverlayStackSnapshotContext);
  const parent = useContext(OverlayParentScopeContext);
  const id = useId();
  const [registered, setRegistered] = useState(false);
  const deferRelease = options.deferRelease ?? false;
  const registerNow = useCallback(() => {
    if (!stack) return;
    stack.register(id, layer);
    setRegistered(true);
  }, [id, layer, stack]);
  const release = useCallback(() => {
    if (!stack) return;
    stack.unregister(id);
    setRegistered(false);
  }, [id, stack]);

  useIsomorphicLayoutEffect(() => {
    if (!stack) return undefined;
    if (open) registerNow();
    else if (!deferRelease) release();
    return undefined;
  }, [deferRelease, open, registerNow, release, stack]);
  useIsomorphicLayoutEffect(() => {
    if (!stack) return undefined;
    return () => stack.unregister(id);
  }, [id, stack]);

  const managed = stack !== null;
  const isTopmost = !open || !managed || (registered && snapshot.topId === id);
  const visualZIndex = managed && registered ? snapshot.zIndexById.get(id) : undefined;
  return { id, managed, parent, isRegistered: registered, isTopmost, release, visualZIndex };
}
