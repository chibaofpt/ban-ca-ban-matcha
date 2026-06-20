import { SWEETNESS_OPTIONS, ICE_OPTIONS } from "@/src/constants/orderOptions";
import type { OrderItemRes } from "@/src/services/staffOrdersListService";
import { Ticket } from "lucide-react";

export function OrderItemDetails({ item }: { item: OrderItemRes }) {
  const line1Chips: string[] = [];
  const line2Chips: string[] = [];
  const addonChips: string[] = [];

  // Sweetness
  const sweetness = SWEETNESS_OPTIONS.find((o) => o.value === item.sweetness)?.label || "50%";
  line1Chips.push(`Ngọt ${sweetness}`);

  // Ice
  if (item.ice_option !== "NORMAL") {
    const ice = ICE_OPTIONS.find((o) => o.value === item.ice_option)?.label;
    if (ice) line1Chips.push(ice);
  }

  // Milk / Powder
  if (item.menuItem.category === "latte") {
    if (item.milkType) line2Chips.push(item.milkType.name);
  } else if (item.menuItem.category === "fusion") {
    if (item.selectedPowder) line2Chips.push(item.selectedPowder.name);
  }

  // Coldwhisk
  if (item.coldwhisk) {
    line2Chips.push("Coldwhisk");
  }

  // Addons
  if (item.addons && item.addons.length > 0) {
    for (const addon of item.addons) {
      const groupName = addon.addonOption.group?.name?.toLowerCase() || "";
      const label = addon.addonOption.label;
      
      if (groupName.includes("kem")) {
        if (!label.toLowerCase().includes("không")) {
          addonChips.push(label); // e.g. "Nửa viên kem"
        }
      } else if (groupName.includes("matcha")) {
        // extra matcha
        if (addon.addonOption.gram_value && addon.addonOption.gram_value !== "0") {
          const priceStr = addon.unit_price_vnd > 0 ? ` (+${(addon.unit_price_vnd / 1000).toLocaleString("vi-VN")}K)` : "";
          addonChips.push(`Thêm ${addon.addonOption.gram_value}g Matcha${priceStr}`);
        }
      } else {
        // other addons (đá dừa...)
        if (!label.toLowerCase().includes("không")) {
          addonChips.push(label);
        }
      }
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1 w-full">
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
      {item.note && (
        <span className="text-[10px] font-medium bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded italic inline-block w-fit">
          📝 {item.note}
        </span>
      )}

      {/* Vouchers applied on this item */}
      {(item.productVoucher || (item.addonVouchers && item.addonVouchers.length > 0)) && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {item.productVoucher && (
            <div className="text-[10px] font-bold bg-orange-50 border border-orange-200 text-orange-700 dark:bg-orange-900/30 dark:border-orange-500/30 dark:text-orange-400 px-2 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <Ticket size={12} className="text-orange-500" /> Free {item.productVoucher.package.name}
              {item.product_voucher_discount_vnd ? ` (-${(item.product_voucher_discount_vnd / 1000).toLocaleString("vi-VN")}K)` : ""}
            </div>
          )}
          {item.addonVouchers && item.addonVouchers.map((av, idx) => (
            <div key={idx} className="text-[10px] font-bold bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-500/30 dark:text-green-400 px-2 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
              <Ticket size={12} className="text-green-600" /> Free {av.voucher.package.name}
              {av.discount_applied_vnd ? ` (-${(av.discount_applied_vnd / 1000).toLocaleString("vi-VN")}K)` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
