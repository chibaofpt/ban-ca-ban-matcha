import { SWEETNESS_OPTIONS, ICE_OPTIONS } from "@/src/constants/orderOptions";
import type { OrderItemRes } from "@/src/services/staffOrdersListService";

export function OrderItemDetails({ item }: { item: OrderItemRes }) {
  const details: string[] = [];

  // Sweetness
  const sweetness = SWEETNESS_OPTIONS.find((o) => o.value === item.sweetness)?.label || "Bình thường";
  details.push(`Độ ngọt: ${sweetness}`);

  // Ice
  if (item.ice_option !== "NORMAL") {
    const ice = ICE_OPTIONS.find((o) => o.value === item.ice_option)?.label;
    if (ice) details.push(`Đá: ${ice}`);
  }

  // Milk / Powder
  if (item.menuItem.category === "latte") {
    if (item.milkType) details.push(`Sữa: ${item.milkType.name}`);
  } else if (item.menuItem.category === "fusion") {
    if (item.selectedPowder) details.push(`Bột: ${item.selectedPowder.name}`);
  }

  // Coldwhisk
  if (item.coldwhisk) {
    details.push("Coldwhisk");
  }

  // Addons
  if (item.addons && item.addons.length > 0) {
    for (const addon of item.addons) {
      const groupName = addon.addonOption.group?.name?.toLowerCase() || "";
      const label = addon.addonOption.label;
      
      if (groupName.includes("kem")) {
        if (!label.toLowerCase().includes("không")) {
          details.push(label); // e.g. "Nửa viên kem"
        }
      } else if (groupName.includes("matcha")) {
        // extra matcha
        if (addon.addonOption.gram_value && addon.addonOption.gram_value !== "0") {
          const priceStr = addon.unit_price_vnd > 0 ? ` (+${(addon.unit_price_vnd / 1000).toLocaleString("vi-VN")}K)` : "";
          details.push(`Thêm ${addon.addonOption.gram_value}g Matcha${priceStr}`);
        }
      } else {
        // other addons (đá dừa...)
        if (!label.toLowerCase().includes("không")) {
          details.push(label);
        }
      }
    }
  }

  // Note
  if (item.note) {
    details.push(`Ghi chú: ${item.note}`);
  }

  // Vouchers applied on this item
  if (item.productVoucher) {
    details.push(`Voucher: Miễn phí (${item.productVoucher.package.name})`);
  }
  if (item.addonVouchers && item.addonVouchers.length > 0) {
    for (const av of item.addonVouchers) {
      details.push(`Voucher: Topping (${av.voucher.package.name})`);
    }
  }

  return (
    <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
      {details.map((detail, idx) => (
        <div key={idx} className={detail.startsWith('Voucher:') ? 'text-primary font-medium' : ''}>
          • {detail}
        </div>
      ))}
    </div>
  );
}
