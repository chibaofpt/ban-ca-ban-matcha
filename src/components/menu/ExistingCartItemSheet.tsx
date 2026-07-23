"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Check, Plus, Settings2, X } from "lucide-react";
import type { CartItem } from "@/src/lib/types/cart";
import { formatKa, formatOrderSize } from "@/src/utils/display";
import { cn } from "@/src/utils/cn";

interface ExistingCartItemSheetProps {
  itemName: string;
  items: CartItem[];
  onClose: () => void;
  onEdit: (item: CartItem) => void;
  onAddNew: () => void;
}

/** Lets customers choose an existing cart configuration or add a new one. */
export function ExistingCartItemSheet({
  itemName,
  items,
  onClose,
  onEdit,
  onAddNew,
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
              return (
                <button
                  key={item.cartId}
                  type="button"
                  onClick={() => setSelectedCartId(item.cartId)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-white hover:border-primary/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                      isSelected ? "border-primary bg-primary text-white" : "border-primary/25",
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-primary">
                      {formatOrderSize(item.size)} · {item.quantity} ly
                    </p>
                    <p className="mt-1 truncate text-xs text-primary/60">
                      {item.note || "Không có ghi chú"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary">
                    {formatKa(item.clientPriceVnd * item.quantity, "ceil")}
                  </span>
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
