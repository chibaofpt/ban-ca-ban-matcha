import type { AdminOrderListItem } from "@/contracts/admin/order";
import type { Category } from "@/contracts/menu";
import type {
  IceOption,
  OrderItemDetail,
  OrderListItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@/contracts/order";
import type { Size, SweetnessLevel } from "@/contracts/menu";

type UnknownRecord = Record<string, unknown>;

interface DecimalLike {
  toString(): string;
}

interface OrderListItemSource {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method: PaymentMethod;
  order_code: string | null;
  auto_cancel_at: Date | null;
  pickup_time: Date | null;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  created_at: Date;
  updated_at: Date;
  user: { name: string; phone_number: string } | null;
  discountVouchers?: Array<{
    voucher: {
      discount_value: number | null;
      discount_type: string | null;
      package: { name: string };
    };
  }>;
  items: Array<{
    menu_item_id?: string;
    quantity: number;
    unit_price_vnd: number;
    addons_price_vnd: number;
    total_discount_vnd?: number;
    product_voucher_discount_vnd?: number;
    size: Size | null;
    sweetness: SweetnessLevel;
    ice_option: IceOption;
    coldwhisk: boolean;
    note: string | null;
    selected_powder_id?: string | null;
    selected_milk_type_id?: string | null;
    menuItem: { name: string; category: string };
    selectedPowder: { name: string; price_per_gram?: DecimalLike } | null;
    milkType: { name: string; is_default: boolean } | null;
    addons: Array<{
      addon_option_id?: string;
      unit_price_vnd: number;
      quantity: number;
      addonOption: {
        label: string;
        gram_value: DecimalLike | null;
        price_vnd: number;
        group: { name: string };
      };
    }>;
    productVoucher?: { package: { name: string } } | null;
    itemVoucher?: { package: { name: string } } | null;
    addonVouchers?: Array<{
      discount_applied_vnd?: number;
      voucher: { package: { name: string } };
    }>;
  }>;
}

interface AdminOrderListItemSource extends OrderListItemSource {
  handler: { name: string; role: string } | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripVoucher(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const safe = { ...value };
  delete safe.id;
  delete safe.user_id;
  delete safe.package_id;
  delete safe.redeemed_by;
  return safe;
}

function stripVoucherLink(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const safe = { ...value };
  delete safe.voucher_id;
  if ("voucher" in safe) safe.voucher = stripVoucher(safe.voucher);
  return safe;
}

function stripOrderItem(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const safe = { ...value };
  delete safe.product_voucher_id;
  delete safe.item_voucher_id;
  if ("productVoucher" in safe) safe.productVoucher = stripVoucher(safe.productVoucher);
  if ("itemVoucher" in safe) safe.itemVoucher = stripVoucher(safe.itemVoucher);
  if (Array.isArray(safe.addonVouchers)) {
    safe.addonVouchers = safe.addonVouchers.map(stripVoucherLink);
  }
  return safe;
}

function isoDate(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

/** Serialize a Prisma order timestamp while tolerating already-serialized test/adapter values. */
export function serializeOrderDate(value: Date | string): string;
export function serializeOrderDate(value: Date | string | null): string | null;
export function serializeOrderDate(
  value: Date | string | null | undefined,
): string | null | undefined;
export function serializeOrderDate(
  value: Date | string | null | undefined,
): string | null | undefined {
  return value instanceof Date ? value.toISOString() : value;
}

/** Project one persisted order item to the public shared wire contract. */
export function toOrderItemDetail<T extends OrderListItemSource["items"][number]>(
  item: T,
): OrderItemDetail {
  return {
    menu_item_id: item.menu_item_id,
    menuItem: {
      name: item.menuItem.name,
      category: item.menuItem.category as Category,
    },
    quantity: item.quantity,
    unit_price_vnd: item.unit_price_vnd,
    addons_price_vnd: item.addons_price_vnd,
    ...(item.total_discount_vnd === undefined ? {} : { total_discount_vnd: item.total_discount_vnd }),
    ...(item.product_voucher_discount_vnd === undefined
      ? {}
      : { product_voucher_discount_vnd: item.product_voucher_discount_vnd }),
    size: item.size,
    sweetness: item.sweetness,
    ice_option: item.ice_option,
    coldwhisk: item.coldwhisk,
    note: item.note,
    selected_powder_id: item.selected_powder_id,
    selected_milk_type_id: item.selected_milk_type_id,
    selectedPowder: item.selectedPowder ? {
      name: item.selectedPowder.name,
      ...(item.selectedPowder.price_per_gram === undefined
        ? {}
        : { price_per_gram: item.selectedPowder.price_per_gram.toString() }),
    } : null,
    milkType: item.milkType,
    addons: item.addons.map((addon) => ({
      addon_option_id: addon.addon_option_id,
      unit_price_vnd: addon.unit_price_vnd,
      quantity: addon.quantity,
      addonOption: {
        label: addon.addonOption.label,
        gram_value: addon.addonOption.gram_value?.toString() ?? null,
        price_vnd: addon.addonOption.price_vnd,
        group: addon.addonOption.group,
      },
    })),
    productVoucher: item.productVoucher
      ? { package: { name: item.productVoucher.package.name } }
      : null,
    itemVoucher: item.itemVoucher
      ? { package: { name: item.itemVoucher.package.name } }
      : null,
    addonVouchers: (item.addonVouchers ?? []).map((link) => ({
      ...(link.discount_applied_vnd === undefined
        ? {}
        : { discount_applied_vnd: link.discount_applied_vnd }),
      voucher: { package: { name: link.voucher.package.name } },
    })),
  };
}

/** Project one staff/admin management-list row to its shared wire contract. */
export function toOrderListItemDto(
  order: OrderListItemSource,
  paymentQrUrl?: string | null,
): OrderListItem {
  const publicOrder = toPublicOrderDto(order as unknown as UnknownRecord);
  return {
    ...publicOrder,
    id: order.id,
    status: order.status,
    order_type: order.order_type,
    payment_method: order.payment_method,
    order_code: order.order_code,
    auto_cancel_at: serializeOrderDate(order.auto_cancel_at),
    ...(paymentQrUrl === undefined ? {} : { payment_qr_url: paymentQrUrl }),
    pickup_time: serializeOrderDate(order.pickup_time),
    subtotal_vnd: order.subtotal_vnd,
    total_voucher_discount_vnd: order.total_voucher_discount_vnd,
    total_vnd: order.total_vnd,
    shipping_fee_vnd: order.shipping_fee_vnd,
    freeship_discount_vnd: order.freeship_discount_vnd,
    grand_total_vnd: order.grand_total_vnd,
    created_at: serializeOrderDate(order.created_at),
    updated_at: serializeOrderDate(order.updated_at),
    user: order.user,
    discountVouchers: (order.discountVouchers ?? []).map((link) => ({
      voucher: {
        discount_value: link.voucher.discount_value,
        discount_type: link.voucher.discount_type,
        package: { name: link.voucher.package.name },
      },
    })),
    items: order.items.map(toOrderItemDetail),
  };
}

/** Project one admin management-list row, including its public handler identity. */
export function toAdminOrderListItemDto(order: AdminOrderListItemSource): AdminOrderListItem {
  if (order.handler && order.handler.role !== "ADMIN" && order.handler.role !== "STAFF") {
    throw new Error("Order handler role invariant violated");
  }
  return {
    ...toOrderListItemDto(order),
    handler: order.handler as AdminOrderListItem["handler"],
  };
}

/** Remove user/voucher database identifiers from an order API response. */
export function toPublicOrderDto<T extends UnknownRecord>(order: T): UnknownRecord {
  const safe: UnknownRecord = { ...order };
  delete safe.user_id;
  delete safe.handled_by;
  delete safe.payment_confirmed_by;
  delete safe.freeship_voucher_id;
  if (isRecord(safe.user)) delete safe.user.id;
  if (isRecord(safe.handler)) delete safe.handler.id;
  if (isRecord(safe.paymentConfirmer)) delete safe.paymentConfirmer.id;
  if (Array.isArray(safe.discountVouchers)) {
    safe.discountVouchers = safe.discountVouchers.map(stripVoucherLink);
  }
  if (Array.isArray(safe.items)) safe.items = safe.items.map(stripOrderItem);
  for (const field of ["auto_cancel_at", "pickup_time", "created_at", "updated_at"]) {
    if (field in safe) safe[field] = isoDate(safe[field]);
  }
  return safe;
}
