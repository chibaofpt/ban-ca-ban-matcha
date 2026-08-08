import { z } from "zod";

const sweetnessEnum = z.enum(["NONE", "QUARTER", "HALF", "THREE_QUARTER", "FULL", "EXTRA"]);
const sizeEnum = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const iceOptionEnum = z.enum(["NORMAL", "LESS_ICE", "NO_ICE", "SEPARATE_ICE"]);
const addonOptionBaseSchema = z.object({
  option_id: z.string().uuid(),
  quantity: z.number().int().min(1),
});
const addonVoucherBaseSchema = z.object({
  voucher_id: z.string().uuid(),
  addon_option_id: z.string().uuid(),
});

const orderItemBaseSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  /** Required for all items — server validates base_price_vnd IS NOT NULL for this size. */
  size: sizeEnum,
  sweetness: sweetnessEnum.default("FULL"),
  ice_option: iceOptionEnum.default("NORMAL"),
  coldwhisk: z.boolean().default(false),
  note: z.string().max(500).optional(),
  addon_option_ids: z.array(addonOptionBaseSchema).default([]),
  product_voucher_id: z.string().uuid().optional(),
  addon_voucher_ids: z.array(addonVoucherBaseSchema).default([]),
  /** Fusion only — server validates against resolved_default_powder_id + fusion_allowed_powder. */
  selected_powder_id: z.string().uuid().optional(),
  /** Latte only — server defaults to is_default milk if omitted. */
  selected_milk_type_id: z.string().uuid().optional(),
  /**
   * Client-computed final price. Required.
   * Server recomputes and rejects with PRICE_CHANGED on mismatch.
   */
  client_price_vnd: z.number().int().min(0),
});

/** Schema for one customer order line, capped at ten cups. */
export const customerOrderItemSchema = orderItemBaseSchema.extend({
  quantity: z.number().int().min(1).max(10),
  addon_option_ids: z
    .array(addonOptionBaseSchema.extend({ quantity: z.number().int().min(1).max(10) }))
    .max(20)
    .default([]),
  addon_voucher_ids: z.array(addonVoucherBaseSchema).max(10).default([]),
});

/** Schema for one staff order line, capped at fifty cups. */
export const staffOrderItemSchema = orderItemBaseSchema.extend({
  quantity: z.number().int().min(1).max(50),
  addon_option_ids: z
    .array(addonOptionBaseSchema.extend({ quantity: z.number().int().min(1).max(50) }))
    .max(50)
    .default([]),
  addon_voucher_ids: z.array(addonVoucherBaseSchema).max(50).default([]),
});

function totalQuantityWithin(max: number) {
  return (items: Array<{ quantity: number }>): boolean =>
    items.reduce((total, item) => total + item.quantity, 0) <= max;
}

/**
 * Schema for the full staff counter order payload.
 * phone_number is optional — omit entirely for anonymous (walk-in, no loyalty) orders.
 * Cross-field rule: if phone_number is present and the user does not exist in DB,
 * customer_name is required (enforced in the route handler, not here).
 */
export const staffOrderSchema = z.object({
  phone_number: z.string().regex(/^(0|\+84)\d{9}$/).optional(),
  customer_name: z.string().min(1).max(100).optional(),
  items: z
    .array(staffOrderItemSchema)
    .min(1)
    .max(50)
    .refine(totalQuantityWithin(100), { message: "Order cannot exceed 100 cups" }),
  /** DISCOUNT vouchers — multiple allowed. Max 1 PERCENT enforced in route handler. */
  discount_voucher_ids: z.array(z.string().uuid()).max(10).default([]),
  /** QR token xác thực khách — bắt buộc khi có voucher và role = STAFF. Admin tự động bypass. */
  customer_qr_token: z.string().uuid().optional(),
});

/** Schema for a customer-initiated order (PICKUP or DELIVERY). */
export const customerOrderSchema = z.object({
  /** Order fulfilment type. Defaults to DELIVERY. */
  order_type: z.enum(["PICKUP", "DELIVERY"]).default("DELIVERY"),
  items: z
    .array(customerOrderItemSchema)
    .min(1)
    .max(20)
    .refine(totalQuantityWithin(20), { message: "Order cannot exceed 20 cups" }),
  /** DISCOUNT vouchers — multiple allowed. Max 1 PERCENT enforced in route handler. */
  discount_voucher_ids: z.array(z.string().uuid()).max(10).default([]),
  pickup_time: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
  /** Delivery address — required when order_type = DELIVERY (enforced in route handler). Phase 5+. */
  delivery_address: z.string().max(500).optional(),
  
  // -- DELIVERY FIELDS --
  address_id: z.string().uuid().optional(),
  delivery_lat: z.number().finite().min(-90).max(90).optional(),
  delivery_lng: z.number().finite().min(-180).max(180).optional(),
  delivery_receiver_name: z.string().trim().min(2).max(100).optional(),
  delivery_receiver_phone: z.string().regex(/^\+84[35789][0-9]{8}$/).optional(),
  client_shipping_fee_vnd: z.number().int().min(0).optional(),
  freeship_voucher_id: z.string().uuid().optional(),
});

export type OrderItem = z.infer<typeof orderItemBaseSchema>;
export type StaffOrderInput = z.infer<typeof staffOrderSchema>;
export type CustomerOrderInput = z.infer<typeof customerOrderSchema>;

