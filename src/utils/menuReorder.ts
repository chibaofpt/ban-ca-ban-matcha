type OrderItem = { id: string };

/** Merge a reordered visible subset back into its original slots. */
export function mergeVisibleMenuOrder<T extends OrderItem>(
  allItems: T[],
  visibleOrder: T[],
  isVisible: (item: T) => boolean,
): T[] {
  let visibleIndex = 0;
  return allItems.map((item) => (
    isVisible(item) ? visibleOrder[visibleIndex++] ?? item : item
  ));
}

/** Move one visible item before another while preserving hidden item slots. */
export function moveVisibleMenuItem<T extends OrderItem>(
  allItems: T[],
  itemId: string,
  beforeId: string | null,
  isVisible: (item: T) => boolean,
): T[] {
  const visibleItems = allItems.filter(isVisible);
  const sourceIndex = visibleItems.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return allItems;
  const [moved] = visibleItems.splice(sourceIndex, 1);
  const targetIndex = beforeId === null
    ? visibleItems.length
    : visibleItems.findIndex((item) => item.id === beforeId);
  visibleItems.splice(targetIndex < 0 ? visibleItems.length : targetIndex, 0, moved);
  return mergeVisibleMenuOrder(allItems, visibleItems, isVisible);
}
