"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCode, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/src/utils/cn";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { AddonModal } from "@/src/components/staff/AddonModal";
import { StaffCartDrawer } from "@/src/components/staff/StaffCartDrawer";
import { StaffOrderForm } from "@/src/components/staff/StaffOrderForm";
import { QRScannerModal } from "@/src/components/staff/QRScannerModal";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { CartItem } from "@/src/lib/types/cart";

// ── Types ────────────────────────────────────────────────────────────────────

type LoadStatus = "loading" | "error" | "success";

interface DiscountVoucher {
  id: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Staff POS page — menu grid, cart drawer, checkout form, QR scanner. */
export default function StaffOrdersPage() {
  // ── Server data ───────────────────────────────────────────────────────

  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const setPowderData = usePowderStore((s) => s.setPowderData);

  // ── Modal control — only one open at a time ────────────────────────────

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // ── QR scan → checkout pre-fill ───────────────────────────────────────

  const [initialPhone, setInitialPhone] = useState("");
  const [productVoucherId, setProductVoucherId] = useState<string | null>(null);

  // ── Cart ──────────────────────────────────────────────────────────────

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountVoucher, setDiscountVoucher] = useState<DiscountVoucher | null>(null);

  // ── Category filter ───────────────────────────────────────────────────

  const [activeCategory, setActiveCategory] = useState("Tất cả");

  // ── Data fetching ─────────────────────────────────────────────────────

  const loadMenu = useCallback(() => {
    setStatus("loading");
    Promise.all([fetchMenu(), fetchPowders()])
      .then(([mData, pData]) => {
        setMenuData(mData);
        setMenuItems([...mData.latte, ...mData.fusion]);
        setPowderData(pData);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [setPowderData]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // ── Derived ───────────────────────────────────────────────────────────

  const categories = useMemo(
    () => ["Tất cả", ...new Set(menuItems.map((i) => i.category))],
    [menuItems]
  );

  const visibleItems = useMemo(
    () =>
      menuItems.filter(
        (i) => activeCategory === "Tất cả" || i.category === activeCategory
      ),
    [menuItems, activeCategory]
  );

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const discount = discountVoucher
    ? discountVoucher.discount_type === "PERCENT"
      ? Math.floor((subtotal * discountVoucher.discount_value) / 100)
      : discountVoucher.discount_value
    : 0;
  const total = Math.max(0, subtotal - discount);

  // ── Cart handlers ─────────────────────────────────────────────────────

  const handleAddToCart = (item: CartItem) => {
    setCart((prev) => [...prev, item]);
    setSelectedItem(null);
    setProductVoucherId(null);
  };

  const handleRemove = (cartId: string) =>
    setCart((prev) => prev.filter((c) => c.cartId !== cartId));

  const handleChangeQuantity = (cartId: string, newQty: number) =>
    setCart((prev) =>
      prev.map((c) =>
        c.cartId === cartId ? { ...c, quantity: Math.max(1, newQty) } : c
      )
    );

  const handleSuccess = () => {
    setCart([]);
    setDiscountVoucher(null);
    setInitialPhone("");
    setCheckoutOpen(false);
    setCartOpen(false);
    toast.success("Đã tạo đơn hàng thành công!");
  };

  // ── QR scan handlers ──────────────────────────────────────────────────

  const handleScanUser = ({ phone_number }: { phone_number: string }) => {
    setScanOpen(false);
    setInitialPhone(phone_number);
    setCheckoutOpen(true);
  };

  const handleScanVoucherDiscount = (data: {
    id: string;
    discount_type: "PERCENT" | "FIXED";
    discount_value: number;
  }) => {
    setDiscountVoucher(data);
    setScanOpen(false);
  };

  const handleScanVoucherProduct = ({
    id,
    menu_item_id,
  }: {
    id: string;
    menu_item_id: string;
  }) => {
    const item = menuItems.find((i) => i.id === menu_item_id);
    if (!item) return;
    setProductVoucherId(id);
    setSelectedItem(item);
    setScanOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="px-4 py-4 space-y-4">
        {/* QR scan button */}
        <button
          id="btn-scan-qr"
          onClick={() => setScanOpen(true)}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-4 px-4 flex items-center justify-center gap-2 shadow-lg hover:bg-primary/90 transition"
        >
          <QrCode size={22} />
          <span className="font-medium">Quét QR khách hàng</span>
        </button>

        {/* Discount voucher indicator */}
        {discountVoucher && (
          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 text-sm">
            <span className="text-green-700 dark:text-green-400 font-medium">
              🏷 Voucher giảm{" "}
              {discountVoucher.discount_type === "PERCENT"
                ? `${discountVoucher.discount_value}%`
                : `🐟 ${discountVoucher.discount_value / 1000} cá`}
            </span>
            <button
              onClick={() => setDiscountVoucher(null)}
              className="text-muted-foreground hover:text-foreground text-xs transition"
              aria-label="Xoá voucher"
            >
              ✕
            </button>
          </div>
        )}

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={cn(
                "shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition border",
                activeCategory === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-secondary/40"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm">Đang tải menu…</p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-muted-foreground">Tải menu thất bại.</p>
            <button
              onClick={loadMenu}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Menu grid */}
        {status === "success" && (
          <div className="grid grid-cols-2 gap-3">
            {visibleItems.map((item) => {
              // Latte items always have sizes — show L base price as reference
              // Fusion items also use sizes — same logic applies
              const lSize = item.sizes.find((s) => s.size === "L");
              const displayPrice = lSize?.base_price_vnd ?? item.sizes[0]?.base_price_vnd ?? 0;

              return (
                <button
                  key={item.id}
                  id={`menu-item-${item.id}`}
                  onClick={() => setSelectedItem(item)}
                  className="bg-card rounded-2xl border border-border p-3 flex flex-col text-left shadow-sm hover:shadow-md transition active:scale-[0.98]"
                >
                  {/* Image */}
                  <div className="aspect-square w-full rounded-xl bg-secondary/40 flex items-center justify-center text-5xl mb-2 overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <span>🍵</span>
                    )}
                  </div>

                  <h3 className="font-medium text-sm leading-tight line-clamp-1">
                    {item.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 capitalize">
                    {item.category}
                  </p>
                  <div className="text-primary font-semibold text-sm mt-1">
                    🐟 {displayPrice / 1000}+ cá
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">
                      (L)
                    </span>
                  </div>
                </button>
              );
            })}

            {visibleItems.length === 0 && (
              <p className="col-span-2 text-sm text-muted-foreground text-center py-8">
                Không có món nào trong danh mục này.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Floating cart button */}
      {cart.length > 0 && (
        <button
          id="btn-open-cart"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 right-4 z-40 bg-accent text-accent-foreground rounded-full shadow-xl px-5 py-3 flex items-center gap-2 hover:scale-105 transition"
        >
          <ShoppingBag size={18} />
          <span className="font-medium text-sm">
            {cart.length} món • 🐟 {subtotal / 1000} cá
          </span>
        </button>
      )}

      {selectedItem && (
        <AddonModal
          item={selectedItem}
          latteItems={menuData?.latte ?? []}
          freeVoucherId={productVoucherId ?? undefined}
          onClose={() => {
            setSelectedItem(null);
            setProductVoucherId(null);
          }}
          onConfirm={handleAddToCart}
        />
      )}

      {/* StaffCartDrawer */}
      {cartOpen && (
        <StaffCartDrawer
          cart={cart}
          discountVoucher={
            discountVoucher
              ? {
                  discount_type: discountVoucher.discount_type,
                  discount_value: discountVoucher.discount_value,
                }
              : null
          }
          onClose={() => setCartOpen(false)}
          onRemove={handleRemove}
          onChangeQuantity={handleChangeQuantity}
          onCheckout={() => {
            setCartOpen(false);
            setCheckoutOpen(true);
          }}
        />
      )}

      {/* StaffOrderForm */}
      {checkoutOpen && (
        <StaffOrderForm
          cart={cart}
          total={total}
          discountVoucherId={discountVoucher?.id ?? null}
          initialPhone={initialPhone}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* QRScannerModal */}
      {scanOpen && (
        <QRScannerModal
          onClose={() => setScanOpen(false)}
          onScanUser={handleScanUser}
          onScanVoucherDiscount={handleScanVoucherDiscount}
          onScanVoucherProduct={handleScanVoucherProduct}
        />
      )}
    </>
  );
}
