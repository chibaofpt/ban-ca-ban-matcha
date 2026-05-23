import { z } from "zod";

const sweetnessEnum = z.enum(["NONE", "QUARTER", "HALF", "THREE_QUARTER", "FULL"]);
const sizeEnum = z.enum(["M", "L", "XL"]);
const iceOptionEnum = z.enum(["NORMAL", "LESS_ICE", "NO_ICE", "SEPARATE_ICE"]);

/** Schema for a single item line in a staff or customer order. */
export const orderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  /** Required for all items — server validates base_price_vnd IS NOT NULL for this size. */
  size: sizeEnum,
  sweetness: sweetnessEnum.default("QUARTER"),
  ice_option: iceOptionEnum.default("NORMAL"),
  coldwhisk: z.boolean().default(false),
  note: z.string().max(500).optional(),
  addon_option_ids: z
    .array(
      z.object({
        option_id: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .default([]),
  product_voucher_id: z.string().uuid().optional(),
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

/**
 * Schema for the full staff counter order payload.
 * phone_number is optional — omit entirely for anonymous (walk-in, no loyalty) orders.
 * Cross-field rule: if phone_number is present and the user does not exist in DB,
 * customer_name is required (enforced in the route handler, not here).
 */
export const staffOrderSchema = z.object({
  phone_number: z.string().regex(/^(0|\+84)\d{9}$/).optional(),
  customer_name: z.string().min(1).max(100).optional(),
  items: z.array(orderItemSchema).min(1),
  voucher_id: z.string().uuid().optional(),
});

/** Schema for a customer-initiated order (PICKUP or DELIVERY). */
export const customerOrderSchema = z.object({
  /** Order fulfilment type. Defaults to PICKUP. DELIVERY is reserved for Phase 5+. */
  order_type: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
  items: z.array(orderItemSchema).min(1),
  voucher_id: z.string().uuid().optional(),
  pickup_time: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
  /** Delivery address — required when order_type = DELIVERY (enforced in route handler). Phase 5+. */
  delivery_address: z.string().max(500).optional(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;
export type StaffOrderInput = z.infer<typeof staffOrderSchema>;
export type CustomerOrderInput = z.infer<typeof customerOrderSchema>;

