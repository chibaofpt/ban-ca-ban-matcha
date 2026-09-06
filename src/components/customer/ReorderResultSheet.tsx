import { Drawer } from "vaul";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import type { ReorderWarning } from "@/src/lib/types/reorder";

interface ReorderResultSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCart: () => void;
  itemName: string;
  configSummary: string[];
  warnings: ReorderWarning[];
  isSuccess: boolean;
}

export default function ReorderResultSheet({
  isOpen,
  onClose,
  onOpenCart,
  itemName,
  configSummary,
  warnings,
  isSuccess
}: ReorderResultSheetProps) {
  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[101] mx-auto flex max-h-[90dvh] max-w-lg flex-col rounded-t-[20px] bg-card text-foreground outline-none">
          <Drawer.Handle className="mt-3 bg-muted-foreground/30" />
          <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none rounded-t-[20px] bg-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <Drawer.Title className="text-[17px] font-semibold text-foreground">
                  {isSuccess ? "Đã thêm vào giỏ" : "Không thể đặt lại"}
                </Drawer.Title>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <Drawer.Description className="sr-only">
                Kết quả kiểm tra cấu hình và giá hiện tại khi đặt lại món.
              </Drawer.Description>
              {/* Item Info */}
              <div className="rounded-xl bg-secondary/30 p-3">
                <h3 className="mb-2 text-[15px] font-medium text-foreground">{itemName}</h3>
                {configSummary.length > 0 && (
                  <ul className="space-y-1 text-[13px] text-muted-foreground">
                    {configSummary.map((config, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="mr-1.5 mt-0.5 opacity-60">•</span>
                        <span className="flex-1">{config}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100">
                  <h4 className="text-[13px] font-medium text-amber-800 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Lưu ý thay đổi
                  </h4>
                  <ul className="space-y-1.5">
                    {warnings.map((w, idx) => (
                      <li key={idx} className="text-[13px] text-amber-700 flex items-start">
                        <span className="mr-1.5 mt-0.5 opacity-60">-</span>
                        <span className="flex-1 leading-snug">{w.details}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="min-h-12 flex-1 rounded-xl bg-secondary text-center text-[15px] font-medium text-foreground transition-colors active:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Đóng
              </button>
              {isSuccess && (
                <button
                  onClick={onOpenCart}
                  className="min-h-12 flex-1 rounded-xl bg-primary text-center text-[15px] font-medium text-primary-foreground shadow-sm transition-colors active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Mở giỏ hàng
                </button>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
