"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCode, ShoppingBag } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/src/utils/cn";
import { fetchMenu } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import { fetchCustomerVouchers, type MyVoucher } from "@/src/services/staffVoucherService";
import { computeFinalClientPrice } from "@/src/lib/store/cartStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import { calcLattePrice, calcFusionPrice, resolveGram } from "@/src/utils/pricing";
import { AddonModal } from "@/src/components/staff/AddonModal";
import { StaffCartDrawer } from "@/src/components/staff/StaffCartDrawer";
import { CustomerSelectModal } from "@/src/components/staff/CustomerSelectModal";
import { QRScannerModal } from "@/src/components/staff/QRScannerModal";
import { VoucherQRVerifyModal } from "@/src/components/staff/VoucherQRVerifyModal";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import * as staffOrderService from "@/src/services/staffOrderService";
import type { CreateStaffOrderPayload } from "@/src/services/staffOrderService";
import type { MenuData, MenuItem } from "@/src/lib/types/menu";
import type { CartItem } from "@/src/lib/types/cart";
import type { CustomerInfo } from "@/src/components/staff/CustomerSelectModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildOrderItems(
  cart: CartItem[]
): CreateStaffOrderPayload["items"] {
  return cart.map((c) => {
    const productVoucherId = c.productVoucherId;
    const addonVouchers = c.addonVouchers ?? [];

    return {
      menu_item_id: c.menuItemId,
      quantity: c.quantity,
      size: c.size,
      sweetness: c.sweetness,
      ice_option: c.iceOption,
      coldwhisk: c.coldwhisk,
      ...(c.note ? { note: c.note } : {}),
      addon_option_ids: [
        ...c.selectedOptionIds.map((id) => ({ option_id: id, quantity: 1 })),
        ...c.quantityAddonOptions,
      ],
      ...(productVoucherId ? { product_voucher_id: productVoucherId } : {}),
      ...(addonVouchers.length > 0
        ? {
            addon_voucher_ids: addonVouchers.map((av) => ({
              voucher_id: av.voucherId,
              addon_option_id: av.addonOptionId,
            })),
          }
        : {}),
      ...(c.selectedPowderId ? { selected_powder_id: c.selectedPowderId } : {}),
      ...(c.selectedMilkTypeId ? { selected_milk_type_id: c.selectedMilkTypeId } : {}),
      client_price_vnd: c.clientPriceVnd,
    };
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = "loading" | "error" | "success";

const SIZE_CARD_LABELS: Record<string, string> = {
  M: "Cá Con",
  L: "Cá Vừa",
  XL: "Cá Lớn",
};

interface DiscountVoucher {
  id: string;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

/** Staff POS page — menu grid, cart drawer, checkout form, QR scanner. */
export default function StaffOrdersPage({ userRole = "STAFF" }: { userRole?: "STAFF" | "ADMIN" }) {
  // ── Server data ───────────────────────────────────────────────────────

  // ── Server data ───────────────────────────────────────────────────────
  const queryClient = useQueryClient();

  const { data: menuData, isLoading: isMenuLoading } = useQuery({
    queryKey: ["staff", "menu"],
    queryFn: fetchMenu,
  });

  const { data: pData, isLoading: isPowderLoading } = useQuery({
    queryKey: ["staff", "powders"],
    queryFn: fetchPowders,
  });

  const menuItems = menuData ? [...menuData.latte, ...menuData.fusion] : [];
  const status: LoadStatus = isMenuLoading || isPowderLoading ? "loading" : (menuData && pData) ? "success" : "error";
  
  const loadMenu = () => {
    queryClient.invalidateQueries({ queryKey: ["staff", "menu"] });
    queryClient.invalidateQueries({ queryKey: ["staff", "powders"] });
  };

  const setPowderData = usePowderStore((s) => s.setPowderData);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  const getDisplayPrice = (item: MenuItem, sizeObj: MenuItem["sizes"][0]) => {
    const isLatte = item.category === "latte";
    const defaultPowderId = isLatte ? item.powder?.id : item.resolved_default_powder_id;
    const defaultMilk = item.milk_types?.find((m) => m.is_default) ?? item.milk_types?.[0];

    const s = sizeObj.size;
    const base = sizeObj.base_price_vnd ?? 0;
    const pwd = powders.find((p) => p.id === defaultPowderId);
    const pwdPrice = pwd?.price_per_gram ?? 0;
    const gram = resolveGram(s, item.custom_powder_grams, pwd?.size_config ?? [], defaultPowderGrams);

    if (isLatte) {
      return calcLattePrice({
        base_price_vnd: base,
        gram,
        powder_price_per_gram: pwdPrice,
        milk_ml: sizeObj.milk_ml ?? 0,
        milk_price_per_ml: defaultMilk?.price_per_ml ?? 40,
      });
    } else {
      return calcFusionPrice({
        base_price_vnd: base,
        gram,
        powder_price_per_gram: pwdPrice,
        premium_latte: 0,
      });
    }
  };

  // ── Modal control — only one open at a time ────────────────────────────

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [qrVerifyOpen, setQrVerifyOpen] = useState(false);

  // ── QR scan & Customer state ──────────────────────────────────────────

  const [initialSearchQuery, setInitialSearchQuery] = useState("");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [productVoucherId, setProductVoucherId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Cart ──────────────────────────────────────────────────────────────

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountVoucher, setDiscountVoucher] = useState<DiscountVoucher | null>(null);

  // ── Voucher state (list-based) ────────────────────────────────────────

  const [customerVouchers, setCustomerVouchers] = useState<MyVoucher[]>([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([]);
  // We removed selectedProductVouchers and selectedAddonVouchers states. 
  // Cart items directly maintain their applied vouchers (c.productVoucherId, c.addonVouchers).

  // ── Category filter ───────────────────────────────────────────────────

  const [activeCategory, setActiveCategory] = useState("Tất cả");

  // ── Data fetching ─────────────────────────────────────────────────────

  // Sync fetched powders to Zustand
  useEffect(() => {
    if (pData) {
      setPowderData(pData);
    }
  }, [pData, setPowderData]);

  // Fetch customer vouchers when customer changes
  useEffect(() => {
    if (customerInfo?.type === "existing") {
      fetchCustomerVouchers(customerInfo.data.id)
        .then(setCustomerVouchers)
        .catch(() => setCustomerVouchers([]));
    } else {
      setCustomerVouchers([]);
    }
    // Clear all voucher selections when customer changes
    setSelectedDiscountIds([]);
    // Remove applied vouchers from existing cart
    setCart(prev => prev.map(c => {
      const next = { ...c, productVoucherId: undefined, productVoucherDiscountVnd: undefined, addonVouchers: undefined };
      next.clientPriceVnd = computeFinalClientPrice(next);
      return next;
    }));
  }, [customerInfo]);

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

  const subtotal = cart.reduce((s, c) => s + c.clientPriceVnd * c.quantity, 0);
  const discount = discountVoucher
    ? discountVoucher.discount_type === "PERCENT"
      ? Math.floor((subtotal * discountVoucher.discount_value) / 100)
      : discountVoucher.discount_value
    : 0;

  /** Returns true if any voucher is applied (either scan-based or list-based). */
  const hasAnyVoucher =
    !!discountVoucher ||
    selectedDiscountIds.length > 0 ||
    cart.some(c => !!c.productVoucherId || (c.addonVouchers && c.addonVouchers.length > 0));

  // ── Cart handlers ─────────────────────────────────────────────────────

  const handleAddToCart = (item: CartItem) => {
    setCart((prev) => [...prev, item]);
    setSelectedItem(null);
    setProductVoucherId(null);
  };

  const handleRemove = (cartId: string) => {
    setCart((prev) => prev.filter((c) => c.cartId !== cartId));
  };

  const handleChangeQuantity = (cartId: string, newQty: number) =>
    setCart((prev) =>
      prev.map((c) =>
        c.cartId === cartId ? { ...c, quantity: Math.max(1, newQty) } : c
      )
    );

  const handleSuccess = () => {
    setCart([]);
    setDiscountVoucher(null);
    setCustomerInfo(null);
    setInitialSearchQuery("");
    setCustomerVouchers([]);
    setSelectedDiscountIds([]);
    setCartOpen(false);
    toast.success("Đã tạo đơn hàng thành công!");
  };

  // ── Checkout flow ─────────────────────────────────────────────────────

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;

    if (hasAnyVoucher && customerInfo?.type === "existing") {
      if (userRole === "ADMIN") {
        setConfirmCheckoutOpen(true);
      } else {
        setQrVerifyOpen(true);
      }
    } else {
      setConfirmCheckoutOpen(true);
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: staffOrderService.createStaffOrder,
    onSuccess: () => {
      handleSuccess();
      queryClient.invalidateQueries({ queryKey: ["staff", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Tạo đơn thất bại. Vui lòng thử lại.");
      }
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleCheckoutConfirm = async (customerQrToken?: string) => {
    setConfirmCheckoutOpen(false);
    setQrVerifyOpen(false);
    setIsSubmitting(true);
    
    let payload: CreateStaffOrderPayload;
    const items = buildOrderItems(cart);
    const discountVoucherIds = [
      ...(discountVoucher ? [discountVoucher.id] : []),
      ...selectedDiscountIds,
    ];

    if (!customerInfo) {
      payload = { items };
    } else if (customerInfo.type === "existing") {
      payload = {
        phone_number: customerInfo.data.phone_number,
        items,
        ...(discountVoucherIds.length > 0 ? { discount_voucher_ids: discountVoucherIds } : {}),
        ...(customerQrToken ? { customer_qr_token: customerQrToken } : {}),
      };
    } else {
      payload = {
        phone_number: customerInfo.phone_number,
        customer_name: customerInfo.name,
        items,
      };
    }

    createOrderMutation.mutate(payload);
  };

  // ── QR scan handlers ──────────────────────────────────────────────────

  const handleScanUser = ({
    phone_number,
    name,
  }: {
    phone_number: string;
    name?: string;
    points_balance?: number;
    id?: string;
  }) => {
    setScanOpen(false);
    if (name) {
      setCustomerInfo({
        type: "existing",
        data: {
          id: name,
          phone_number,
          name,
          points_balance: 0,
        },
      });
      toast.success(`Đã áp dụng khách hàng: ${name}`);
    } else {
      setInitialSearchQuery(phone_number);
      setCustomerSelectOpen(true);
    }
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

  // ── Voucher list handlers ─────────────────────────────────────────────

  const handleToggleDiscount = (voucherId: string) => {
    setSelectedDiscountIds((prev) =>
      prev.includes(voucherId)
        ? prev.filter((id) => id !== voucherId)
        : [...prev, voucherId]
    );
  };

  const handleApplyProduct = (cartId: string, voucher: MyVoucher) => {
    if (!voucher.covered_price_vnd) return;
    setCart((prev) => {
      const currentItems = [...prev];
      const itemIndex = currentItems.findIndex((c) => c.cartId === cartId);
      if (itemIndex === -1) return prev;

      const item = currentItems[itemIndex];
      const nextItem = { 
        ...item, 
        productVoucherId: voucher.id, 
        productVoucherDiscountVnd: voucher.covered_price_vnd ?? undefined 
      };
      nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);

      if (item.quantity === 1) {
        currentItems[itemIndex] = nextItem;
        return currentItems;
      }

      // Split if quantity > 1
      const newCartId = crypto.randomUUID();
      const splitItem = { ...nextItem, cartId: newCartId, quantity: 1 };
      currentItems[itemIndex] = { ...item, quantity: item.quantity - 1 };
      currentItems.splice(itemIndex + 1, 0, splitItem);
      
      return currentItems;
    });
  };

  const handleRemoveProduct = (cartId: string) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.cartId !== cartId) return c;
        const nextItem = {
          ...c,
          productVoucherId: undefined,
          productVoucherDiscountVnd: undefined,
        };
        nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);
        return nextItem;
      })
    );
  };

  const handleApplyAddon = (cartId: string, voucher: MyVoucher) => {
    const addonOptionId = voucher.addon_option_id;
    if (!addonOptionId) return;
    
    setCart((prev) => {
      const currentItems = [...prev];
      const itemIndex = currentItems.findIndex((c) => c.cartId === cartId);
      if (itemIndex === -1) return prev;

      const item = currentItems[itemIndex];
      const newAddonVouchers = item.addonVouchers ? [...item.addonVouchers] : [];
      
      // Prevent applying duplicate voucher
      if (newAddonVouchers.some(av => av.voucherId === voucher.id)) return prev;

      const existingIdx = newAddonVouchers.findIndex(v => v.addonOptionId === addonOptionId);
      const toppingPrice = item.addonPrices?.[addonOptionId] ?? 0;
      const newVoucher = { voucherId: voucher.id, addonOptionId: addonOptionId, discountVnd: toppingPrice };

      if (existingIdx !== -1) {
        newAddonVouchers[existingIdx] = newVoucher;
      } else {
        newAddonVouchers.push(newVoucher);
      }

      const nextItem = { ...item, addonVouchers: newAddonVouchers };
      nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);

      if (item.quantity === 1) {
        currentItems[itemIndex] = nextItem;
        return currentItems;
      }

      // Split
      const newCartId = crypto.randomUUID();
      const splitItem = { ...nextItem, cartId: newCartId, quantity: 1 };
      currentItems[itemIndex] = { ...item, quantity: item.quantity - 1 };
      currentItems.splice(itemIndex + 1, 0, splitItem);
      
      return currentItems;
    });
  };

  const handleRemoveAddon = (cartId: string, voucherId: string) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.cartId !== cartId) return c;
        if (!c.addonVouchers) return c;
        const nextItem = { ...c, addonVouchers: c.addonVouchers.filter(v => v.voucherId !== voucherId) };
        nextItem.clientPriceVnd = computeFinalClientPrice(nextItem);
        return nextItem;
      })
    );
  };

  // ── QR verify success (STAFF role) ────────────────────────────────────

  const handleQrVerified = (qrToken: string) => {
    setQrVerifyOpen(false);
    handleCheckoutConfirm(qrToken);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="px-4 md:px-0 py-4 space-y-4">
        {/* QR scan button */}
        <button
          id="btn-scan-qr"
          onClick={() => setScanOpen(true)}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-4 px-4 flex items-center justify-center gap-2 shadow-lg hover:bg-primary/90 transition"
        >
          <QrCode size={22} />
          <span className="font-medium">Quét QR khách hàng</span>
        </button>

        {/* Discount voucher indicator (from QR scan) */}
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
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 md:mx-0 px-4 md:px-0 no-scrollbar">
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {visibleItems.map((item) => {
              return (
                <button
                  key={item.id}
                  id={`menu-item-${item.id}`}
                  onClick={() => setSelectedItem(item)}
                  className="bg-card rounded-2xl border border-border p-3 flex flex-col text-left shadow-sm hover:shadow-md transition active:scale-[0.98] w-full"
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
                  <p className="text-[11px] text-muted-foreground line-clamp-1 capitalize mb-2">
                    {item.category}
                  </p>

                  {/* Size prices row */}
                  <div className="mt-auto pt-2 border-t border-border/50 w-full">
                    <div className="flex items-end justify-between gap-1">
                      {item.sizes.filter((s) => s.base_price_vnd != null).map((s) => (
                        <div key={s.size} className="flex flex-col items-center gap-0.5 flex-1">
                          <span className="text-[8px] font-bold text-primary/50 uppercase tracking-wide whitespace-nowrap">
                            {SIZE_CARD_LABELS[s.size] ?? s.size}
                          </span>
                          <span className="text-[11px] font-bold text-primary">
                            {getDisplayPrice(item, s) / 1000}k
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}

            {visibleItems.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground text-center py-8">
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
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 bg-accent text-accent-foreground rounded-full shadow-xl px-5 py-3 flex items-center gap-2 hover:scale-105 transition"
        >
          <ShoppingBag size={18} />
          <span className="font-medium text-sm">
            {cart.length} món • 🐟 {subtotal / 1000} cá
          </span>
        </button>
      )}

      <AddonModal
        isOpen={!!selectedItem}
        item={selectedItem}
        latteItems={menuData?.latte ?? []}
        freeVoucherId={productVoucherId ?? undefined}
        onClose={() => {
          setSelectedItem(null);
          setProductVoucherId(null);
        }}
        onConfirm={handleAddToCart}
      />

      {/* StaffCartDrawer */}
      <StaffCartDrawer
        isOpen={cartOpen}
        cart={cart}
        discountVoucher={
          discountVoucher
            ? {
                discount_type: discountVoucher.discount_type,
                discount_value: discountVoucher.discount_value,
              }
            : null
        }
        customerInfo={customerInfo}
        isSubmitting={isSubmitting}
        onClose={() => setCartOpen(false)}
        onRemove={handleRemove}
        onChangeQuantity={handleChangeQuantity}
        onCheckout={handleCheckoutClick}
        onOpenCustomerSelect={() => setCustomerSelectOpen(true)}
        onClearCustomer={() => setCustomerInfo(null)}
        customerVouchers={customerVouchers}
        selectedDiscountIds={selectedDiscountIds}
        onToggleDiscount={handleToggleDiscount}
        onApplyProduct={handleApplyProduct}
        onRemoveProduct={handleRemoveProduct}
        onApplyAddon={handleApplyAddon}
        onRemoveAddon={handleRemoveAddon}
      />

      {/* CustomerSelectModal */}
      {customerSelectOpen && (
        <CustomerSelectModal
          initialQuery={initialSearchQuery}
          onClose={() => setCustomerSelectOpen(false)}
          onSelect={(info) => {
            setCustomerInfo(info);
            setCustomerSelectOpen(false);
          }}
        />
      )}

      {/* Confirm Checkout Modal (no voucher path) */}
      <ConfirmModal
        isOpen={confirmCheckoutOpen}
        title="Xác nhận tạo đơn"
        message={`Bạn có chắc chắn muốn tạo đơn hàng này? ${
          !customerInfo ? "(Đơn khách vãng lai)" : ""
        }`}
        confirmLabel="Tạo đơn"
        cancelLabel="Huỷ"
        onConfirm={() => handleCheckoutConfirm()}
        onCancel={() => setConfirmCheckoutOpen(false)}
      />

      {/* VoucherQRVerifyModal — STAFF role only, shown when order has vouchers */}
      {qrVerifyOpen && customerInfo?.type === "existing" && (
        <VoucherQRVerifyModal
          customerInfo={customerInfo}
          onVerified={handleQrVerified}
          onClose={() => setQrVerifyOpen(false)}
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
