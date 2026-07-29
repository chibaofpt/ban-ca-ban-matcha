import type { OrderItemRes } from "@/src/services/staffOrdersListService";

/** Groups identical order items (matching drink, size, sweetness, ice, milk, powder, addons, and note) into single items with combined quantities. */
export function groupOrderItems<T extends OrderItemRes>(items: T[]): T[] {
  if (!items || items.length === 0) return [];

  const groupedMap = new Map<string, T>();
  const result: T[] = [];

  for (const item of items) {
    // Generate deterministic signature for addons
    const addonsSig = (item.addons || [])
      .map((a) => {
        const groupName = a.addonOption.group?.name || "";
        const optionIdentity =
          a.addon_option_id ?? `${groupName}:${a.addonOption.label}`;
        return `${optionIdentity}:${a.quantity}:${a.unit_price_vnd}`;
      })
      .sort()
      .join("|");

    // Generate grouping key based on item configuration
    const key = [
      item.menu_item_id ?? item.menuItem.name,
      item.menuItem.category,
      item.size,
      item.sweetness,
      item.ice_option,
      item.coldwhisk ? "1" : "0",
      item.milkType?.name || "",
      item.selectedPowder?.name || "",
      (item.note || "").trim(),
      addonsSig,
    ].join("~~");

    const existing = groupedMap.get(key);
    if (!existing) {
      // Shallow copy so we don't mutate the original item object
      const newItem = { ...item };
      if (item.addonVouchers) {
        newItem.addonVouchers = [...item.addonVouchers];
      }
      groupedMap.set(key, newItem);
      result.push(newItem);
    } else {
      // Combine quantity
      existing.quantity += item.quantity;

      // Combine discount amounts if present
      if (item.total_discount_vnd !== undefined) {
        existing.total_discount_vnd = (existing.total_discount_vnd || 0) + item.total_discount_vnd;
      }
      if (item.product_voucher_discount_vnd !== undefined) {
        existing.product_voucher_discount_vnd =
          (existing.product_voucher_discount_vnd || 0) + item.product_voucher_discount_vnd;
      }

      // Preserve product voucher if not set yet on existing
      if (!existing.productVoucher && item.productVoucher) {
        existing.productVoucher = item.productVoucher;
      }

      // Combine addon vouchers if present
      if (item.addonVouchers && item.addonVouchers.length > 0) {
        existing.addonVouchers = [
          ...(existing.addonVouchers || []),
          ...item.addonVouchers,
        ];
      }
    }
  }

  return result;
}
