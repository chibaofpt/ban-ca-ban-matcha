import type { Category, Size, SweetnessLevel } from "../menu";
import type { IceOption, OrderStatus, OrderType } from "../order";
import type { OwnedVoucherStatus, VoucherIssuedVia, VoucherType } from "../voucher";

export interface AdminUserPage<TItem> {
  items: TItem[];
  total: number;
  page: number;
  total_pages: number;
}

export interface AdminUserSummary {
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
}

export interface AdminUserOrderItem {
  id: string;
  quantity: number;
  size: Size | null;
  unit_price_vnd: number;
  addons_price_vnd: number;
  line_total_vnd: number;
  line_payable_vnd: number;
  total_discount_vnd: number;
  menu_item: { id: string; name: string; category: Category; image_url: string | null };
  selected_powder: { id: string; name: string } | null;
  base_liquid: { id: string; name: string } | null;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note: string | null;
  addons: Array<{
    id: string;
    label: string;
    quantity: number;
    gram_value: string | null;
    unit_price_vnd: number;
  }>;
  item_voucher: { name: string } | null;
  product_voucher: { name: string } | null;
  addon_vouchers: Array<{ name: string }>;
}

export interface AdminUserOrder {
  id: string;
  code: string | null;
  status: OrderStatus;
  type: OrderType;
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
  order_vouchers: Array<{ name: string; type: VoucherType }>;
  bundle_applications: Array<{
    id: string;
    name: string;
    status: string;
    qualifiers: Array<{ order_item_id: string; quantity: number }>;
    rewards: Array<{
      order_item_id: string | null;
      parent_order_item_id: string | null;
      addon_label: string | null;
      quantity: number;
      discount_vnd: number;
    }>;
  }>;
}

export interface AdminUserVoucher {
  qr_token: string;
  name: string;
  description: string | null;
  status: OwnedVoucherStatus;
  expires_at: string | null;
  created_at: string;
  redeemed_at: string | null;
  issued_via: VoucherIssuedVia;
  days_remaining: number | null;
}

export interface AdminUserVoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: VoucherType;
}

export type AdminUserVoucherCategory = "ALL" | "DISCOUNT" | "GIFT" | "SHIPPING";

export type AdminUserPatch =
  | { action: "verify"; is_verified: boolean }
  | { action: "block"; is_blocked: boolean }
  | { action: "reset_password" };

export interface AdminUserPasswordResetResult {
  success: true;
  temporary_password: string;
}

export interface AdminUserMutationResult {
  success: true;
}

export interface AdminUserPointsInput {
  points: number;
}

export interface AdminUserPointsResult {
  points_balance: number;
}

export interface AdminUserListQuery {
  page: number;
  q?: string;
}

export interface AdminUserPageQuery {
  page: number;
}

export interface AdminUserVoucherPackageQuery extends AdminUserPageQuery {
  category: AdminUserVoucherCategory;
}
