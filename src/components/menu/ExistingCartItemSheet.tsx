"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Check, Minus, Plus, Settings2, Trash2, X } from "lucide-react";
import type { CartItem } from "@/src/lib/types/cart";
import type { AddonGroup, MilkTypeOption } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";
import { formatKa, formatOrderSize } from "@/src/utils/display";
import { cn } from "@/src/utils/cn";

interface ExistingCartItemSheetProps {
  itemName: string;
  items: CartItem[];
  addonGroups: AddonGroup[];
  milkTypes: MilkTypeOption[];
  powders: Powder[];
  onClose: () => void;
  onEdit: (item: CartItem) => void;
  onAddNew: () => void;
  onUpdateQuantity: (cartId: string, quantity: number) => void;
  onRemoveItem: (cartId: string) => void;
}

const SWEETNESS_LABEL: Record<string, string> = {
  NONE: "Không đường",
  QUARTER: "25% đường",
  HALF: "50% đường",
  THREE_QUARTER: "75% đường",
  FULL: "100% đường",
  EXTRA: "Nhiều đường",
};

const ICE_LABEL: Record<string, string> = {
  NORMAL: "Đá bình thường",
  LESS_ICE: "Ít đá",
  NO_ICE: "Không đá",
  SEPARATE_ICE: "Đá riêng",
};

/**
 * Builds a flat list of human-readable detail tags for a cart item.
 * Used to show the full configuration in ExistingCartItemSheet.
 */
function buildDetailTags(
  item: CartItem,
  addonGroups: AddonGroup[],
  milkTypes: MilkTypeOption[],
  powders: Powder[],
): string[] {
  const tags: string[] = [];

  // Sweetness
  tags.push(SWEETNESS_LABEL[item.sweetness] ?? item.sweetness);

  // Ice
  tags.push(ICE_LABEL[item.iceOption] ?? item.iceOption);

  // Coldwhisk (latte only typically, but show if true)
  if (item.coldwhisk) tags.push("Cold whisk");

  // Base Liquid (Latte or Fusion)
  const selectedBaseLiquidId = item.selectedBaseLiquidId ?? item.selectedMilkTypeId;
  if (selectedBaseLiquidId) {
    const liquid = milkTypes.find((m) => m.id === selectedBaseLiquidId);
    if (liquid) tags.push(liquid.name);
  }

  // Powder (fusion only)
  if (item.selectedPowderId) {
    const powder = powders.find((p) => p.id === item.selectedPowderId);
    if (powder) tags.push(`Bột ${powder.name}`);
  }

  // Addon options (SELECTOR / TOGGLE)
  if (item.selectedOptionIds.length > 0) {
    const allOptions = addonGroups.flatMap((g) => g.options);
    for (const optId of item.selectedOptionIds) {
      const opt = allOptions.find((o) => o.id === optId);
      if (opt) tags.push(opt.label);
    }
  }


  return tags;
}

/** Lets customers choose an existing cart configuration to edit, or add a new one. */
export function ExistingCartItemSheet({
  itemName,
  items,
  addonGroups,
  milkTypes,
  powders,
  onClose,
  onEdit,
  onAddNew,
  onUpdateQuantity,
  onRemoveItem,
}: ExistingCartItemSheetProps) {
  const [selectedCartId, setSelectedCartId] = useState(items.at(-1)?.cartId ?? "");

  const selectedItem = items.find((item) => item.cartId === selectedCartId) ?? items.at(-1);

  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[120] bg-black/45" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[121] mx-auto flex max-h-[85dvh] max-w-lg flex-col rounded-t-[2rem] bg-[#fdfcf7] shadow-2xl outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-primary/20" />
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 pb-4 pt-3">
            <div>
              <Drawer.Title className="font-serif text-xl font-bold text-primary">
                Món này đã có trong giỏ
              </Drawer.Title>
              <Drawer.Description className="mt-1 text-sm text-primary/65">
                Chọn một cấu hình {itemName} để điều chỉnh.
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 py-4">
            {items.map((item) => {
              const isSelected = item.cartId === selectedItem?.cartId;
              const tags = buildDetailTags(item, addonGroups, milkTypes, powders);
              const hasItemVoucher = !!(item.productVoucherId || (item.addonVouchers && item.addonVouchers.length > 0));

              return (
                <button
                  key={item.cartId}
                  type="button"
                  onClick={() => setSelectedCartId(item.cartId)}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-white hover:border-primary/30",
                  )}
                >
                  {/* Top row: radio + size/qty + price */}
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                        isSelected ? "border-primary bg-primary text-white" : "border-primary/25",
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </div>
                    <p className="text-sm font-bold text-primary shrink-0">
                      {item.size ? formatOrderSize(item.size) : "Add-on"}
                    </p>
                    {/* Stepper */}
                    <div className="flex items-center gap-1 bg-primary/5 rounded-full px-1 py-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.quantity <= 1) {
                            onRemoveItem(item.cartId);
                          } else {
                            onUpdateQuantity(item.cartId, item.quantity - 1);
                          }
                        }}
                        disabled={hasItemVoucher}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
                        aria-label={item.quantity === 1 ? "Xóa khỏi giỏ" : "Giảm số lượng"}
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="text-xs font-bold text-primary text-center w-5">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateQuantity(item.cartId, item.quantity + 1);
                        }}
                        disabled={hasItemVoucher || item.quantity >= 10}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors disabled:opacity-30"
                        aria-label="Tăng số lượng"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary ml-auto">
                      {formatKa(item.clientPriceVnd * item.quantity, "ceil")}
                    </span>
                  </div>

                  {/* Detail tags */}
                  <div className="flex flex-wrap gap-1.5 pl-9">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary/70"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.note && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200/60">
                        📝 {item.note}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border/60 bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={onAddNew}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-primary px-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus className="h-4 w-4" />
              Thêm mới
            </button>
            <button
              type="button"
              disabled={!selectedItem}
              onClick={() => selectedItem && onEdit(selectedItem)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Settings2 className="h-4 w-4" />
              Điều chỉnh
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
