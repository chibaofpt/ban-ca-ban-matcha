export type AdminUserPage<TItem> = {
  items: TItem[];
  total: number;
  page: number;
  total_pages: number;
};

export type AdminUserSummary = {
  qr_token: string;
  name: string;
  phone_number: string;
  insta_name: string | null;
  is_registered: boolean;
  is_verified: boolean;
  is_blocked: boolean;
  points_balance: number;
  spending_year: number;
  annual_spend_vnd: number;
  points_spent: number;
  vouchers_exchanged: number;
  current_voucher_count: number;
  latest_order_at: string | null;
  latest_completed_order_at: string | null;
};

export type AdminUserOrderItem = {
  id: string;
  quantity: number;
  size: string | null;
  unit_price_vnd: number;
  addons_price_vnd: number;
  line_total_vnd: number;
  line_payable_vnd: number;
  total_discount_vnd: number;
  menu_item: {
    id: string;
    name: string;
    category: string;
    image_url: string | null;
  };
  selected_powder: { id: string; name: string } | null;
  base_liquid: { id: string; name: string } | null;
  sweetness: string;
  ice_option: string;
  coldwhisk: boolean;
  note: string | null;
  addons: {
    id: string;
    label: string;
    quantity: number;
    gram_value: string | null;
    unit_price_vnd: number;
  }[];
  item_voucher: { name: string } | null;
  product_voucher: { name: string } | null;
  addon_vouchers: { name: string }[];
};

export type AdminUserOrder = {
  id: string;
  code: string | null;
  status: string;
  type: string;
  created_at: string;
  delivery_receiver_name: string | null;
  delivery_receiver_phone: string | null;
  delivery_address: string | null;
  address_label: string | null;
  subtotal_vnd: number;
  item_discount_vnd: number;
  total_voucher_discount_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  points_earned: number | null;
  points_breakdown: {
    order_points: number;
    surplus_points: number;
    reversed_points: number;
    total_received: number;
  } | null;
  items: AdminUserOrderItem[];
  order_vouchers: { name: string; type: string }[];
  bundle_applications: {
    id: string;
    name: string;
    status: string;
    qualifiers: { order_item_id: string; quantity: number }[];
    rewards: {
      order_item_id: string | null;
      parent_order_item_id: string | null;
      addon_label: string | null;
      quantity: number;
      discount_vnd: number;
    }[];
  }[];
};

export type AdminUserVoucher = {
  qr_token: string;
  name: string;
  description: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  redeemed_at: string | null;
  issued_via: string;
  days_remaining: number | null;
};

export type AdminUserVoucherPackage = {
  id: string;
  name: string;
  description: string | null;
  voucher_type: string;
};

export type AdminUserVoucherCategory = "ALL" | "DISCOUNT" | "GIFT" | "SHIPPING";

export type AdminUserPatch =
  | { action: "verify"; is_verified: boolean }
  | { action: "block"; is_blocked: boolean }
  | { action: "reset_password" };

export type AdminUserPasswordResetResult = {
  success: true;
  temporary_password: string;
};
