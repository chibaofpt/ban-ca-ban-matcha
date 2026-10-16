import { SWEETNESS_OPTIONS, ICE_OPTIONS } from "@/src/constants/orderOptions";
import type { OrderItemRes } from "@/src/services/staffOrdersListService";
import { Ticket } from "lucide-react";
import Image from "next/image";
import { formatKa } from "@/src/utils/display";

/** Render configuration and each persisted item voucher exactly once. */
export function OrderItemDetails({ item }: { item: OrderItemRes }) {
  const lineVoucher = item.productVoucher ?? item.itemVoucher;
  const line1Chips: string[] = [];
  const line2Chips: string[] = [];
  const addonChips: string[] = [];

  // Drinks carry sweetness and ice; Add-on items (size = null) do not.
  const isDrink = item.size !== null;
  if (isDrink) {
    const sweetness = SWEETNESS_OPTIONS.find((o) => o.value === item.sweetness)?.label;
    if (sweetness) line1Chips.push(`Ngọt ${sweetness}`);

    if (item.ice_option !== "NORMAL") {
      const ice = ICE_OPTIONS.find((o) => o.value === item.ice_option)?.label;
      if (ice) line1Chips.push(ice);
    }
  }

  // Base Liquid applies to every drink; the persisted field keeps its legacy milkType name.
  if (isDrink && item.milkType) line2Chips.push(item.milkType.name);

  // Powder is user-selectable for fusion; latte keeps the item's fixed powder.
  if (isDrink && item.menuItem.category === "fusion" && item.selectedPowder) {
    line2Chips.push(item.selectedPowder.name);
  }

  // Coldwhisk
  if (isDrink && item.coldwhisk) {
    line2Chips.push("Coldwhisk");
  }

  // Addons — branch on persisted data, never on the group name.
  if (item.addons && item.addons.length > 0) {
    for (const addon of item.addons) {
      const label = addon.addonOption.label;
      const gramValue = addon.addonOption.gram_value;
      const priceStr = addon.unit_price_vnd > 0 ? ` (+${formatKa(addon.unit_price_vnd)})` : "";

      if (gramValue && gramValue !== "0") {
        // Dynamic-gram extra matcha: price is gram_value × powder price.
        addonChips.push(`Thêm ${gramValue}g Matcha${priceStr}`);
      } else if (!label.toLowerCase().includes("không")) {
        // Fixed-price addons: kem, đá dừa, "Thêm Matcha Khác"...
        addonChips.push(`${label}${priceStr}`);
      }
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1 w-full">
      {item.menuItem.image_url && (
        <Image
          src={item.menuItem.image_url}
          alt={item.menuItem.name}
          width={36}
          height={36}
          sizes="36px"
          quality={60}
          className="h-9 w-9 rounded-lg object-cover"
        />
      )}
      {line1Chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {line1Chips.map((chip, idx) => (
            <span key={idx} className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {chip}
            </span>
          ))}
        </div>
      )}
      {line2Chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {line2Chips.map((chip, idx) => (
            <span key={idx} className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
              {chip}
            </span>
          ))}
        </div>
      )}
      {addonChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {addonChips.map((chip, idx) => (
            <span key={idx} className="text-[10px] font-medium bg-secondary text-secondary-foreground/90 px-1.5 py-0.5 rounded">
              {chip}
            </span>
          ))}
        </div>
      )}
      {item.bundleAllocations && item.bundleAllocations.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Phân bổ ưu đãi BUNDLE">
          {item.bundleAllocations.map((allocation) => (
            <span key={allocation.package_name} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              {allocation.package_name}: {allocation.quantity} phần
            </span>
          ))}
        </div>
      )}
      {item.note && (
        <span className="text-[10px] font-medium bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded italic inline-block w-fit">
          📝 {item.note}
        </span>
      )}

      {/* Vouchers applied on this item */}
      {(lineVoucher || (item.addonVouchers && item.addonVouchers.length > 0)) && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {lineVoucher && (
            <div className="text-[10px] font-bold bg-muted/50 border border-border text-primary px-2 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <Ticket size={12} className="text-primary" /> {lineVoucher.package.name}
              {item.product_voucher_discount_vnd ? ` (-${formatKa(item.product_voucher_discount_vnd)})` : ""}
            </div>
          )}
          {item.addonVouchers && item.addonVouchers.map((av, idx) => (
            <div key={idx} className="text-[10px] font-bold bg-muted/50 border border-border text-primary px-2 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <Ticket size={12} className="text-primary" /> Free {av.voucher.package.name}
              {av.discount_applied_vnd ? ` (-${formatKa(av.discount_applied_vnd)})` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
