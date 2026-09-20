import type { Prisma, VoucherType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { adminVoucherDaysRemaining, effectiveAdminVoucherStatus, vietnamYearBounds } from "@/lib/adminUserTime";
import type {
  AdminUserOrder,
  AdminUserPage,
  AdminUserSummary,
  AdminUserVoucher,
  AdminUserVoucherCategory,
  AdminUserVoucherPackage,
} from "@/src/lib/types/adminUser";

const PAGE_SIZE = 10;

function customerFilter(q?: string): Prisma.UserWhereInput {
  const query = q?.trim();
  if (!query) return { role: "CUSTOMER" };
  const instagram = query.startsWith("@") ? query.slice(1) : query;
  return {
    role: "CUSTOMER",
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { phone_number: { contains: query } },
      { insta_name: { contains: instagram, mode: "insensitive" } },
    ],
  };
}

async function summarizeUsers(
  userIds: string[],
  latestCompleted: Map<string, Date>,
  now: Date,
): Promise<AdminUserSummary[]> {
  if (userIds.length === 0) return [];
  const { year, start, end } = vietnamYearBounds(now);
  const [users, latestOrders, spend, spent, exchanged, current] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds }, role: "CUSTOMER" }, select: {
      id: true, qr_token: true, name: true, phone_number: true, insta_name: true,
      password_hash: true, is_verified: true, is_blocked: true, points_balance: true,
    } }),
    prisma.order.groupBy({
      by: ["user_id"], where: { user_id: { in: userIds } }, _max: { created_at: true },
    }),
    prisma.order.groupBy({ by: ["user_id"], where: {
      user_id: { in: userIds }, status: "COMPLETED", created_at: { gte: start, lt: end },
    }, _sum: { grand_total_vnd: true } }),
    prisma.pointsLog.groupBy({ by: ["user_id"], where: {
      user_id: { in: userIds }, reason: "voucher_purchase", delta: { lt: 0 },
    }, _sum: { delta: true } }),
    prisma.voucher.groupBy({ by: ["user_id"], where: {
      user_id: { in: userIds }, issued_via: "POINTS_EXCHANGE",
    }, _count: { _all: true } }),
    prisma.voucher.groupBy({ by: ["user_id"], where: {
      user_id: { in: userIds }, OR: [{ status: "RESERVED" }, { status: "ACTIVE", OR: [{ expires_at: null }, { expires_at: { gt: now } }] }],
    }, _count: { _all: true } }),
  ]);
  const latestOrderMap = new Map(latestOrders.flatMap((row) =>
    row.user_id && row._max.created_at ? [[row.user_id, row._max.created_at] as const] : []));
  const spendMap = new Map(spend.map((row) => [row.user_id, row._sum.grand_total_vnd ?? 0]));
  const spentMap = new Map(spent.map((row) => [row.user_id, Math.abs(row._sum.delta ?? 0)]));
  const exchangeMap = new Map(exchanged.map((row) => [row.user_id, row._count._all]));
  const currentMap = new Map(current.map((row) => [row.user_id, row._count._all]));
  const userMap = new Map(users.map((user) => [user.id, user]));
  return userIds.flatMap((id) => {
    const user = userMap.get(id);
    if (!user) return [];
    return [{
      qr_token: user.qr_token, name: user.name, phone_number: user.phone_number,
      insta_name: user.insta_name, is_registered: user.password_hash !== "GHOST_USER_NO_PASSWORD",
      is_verified: user.is_verified, is_blocked: user.is_blocked,
      points_balance: user.points_balance, spending_year: year, annual_spend_vnd: spendMap.get(id) ?? 0,
      points_spent: spentMap.get(id) ?? 0, vouchers_exchanged: exchangeMap.get(id) ?? 0,
      current_voucher_count: currentMap.get(id) ?? 0,
      latest_order_at: latestOrderMap.get(id)?.toISOString() ?? null,
      latest_completed_order_at: latestCompleted.get(id)?.toISOString() ?? null,
    }];
  });
}

/** Lists CUSTOMER accounts by latest completed order, followed by all remaining accounts. */
export async function listAdminUsers(page: number, q?: string, now = new Date()): Promise<AdminUserPage<AdminUserSummary>> {
  const where = customerFilter(q);
  const offset = (page - 1) * PAGE_SIZE;
  const [total, completedCount] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { AND: [where, { orders: { some: { status: "COMPLETED" } } }] } }),
  ]);
  const orderedSkip = Math.min(offset, completedCount);
  const orderedTake = Math.min(PAGE_SIZE, Math.max(0, completedCount - offset));
  const grouped = orderedTake > 0 ? await prisma.order.groupBy({
    by: ["user_id"], where: { user_id: { not: null }, status: "COMPLETED", user: { is: where } },
    _max: { updated_at: true }, orderBy: [{ _max: { updated_at: "desc" } }, { user_id: "asc" }],
    skip: orderedSkip, take: orderedTake,
  }) : [];
  const orderedIds = grouped.flatMap((row) => row.user_id ? [row.user_id] : []);
  const latestCompleted = new Map(grouped.flatMap((row) =>
    row.user_id && row._max.updated_at ? [[row.user_id, row._max.updated_at] as const] : []));
  const remaining = PAGE_SIZE - orderedIds.length;
  const withoutCompleted = remaining > 0 ? await prisma.user.findMany({
    where: { AND: [where, { orders: { none: { status: "COMPLETED" } } }] }, select: { id: true },
    orderBy: { qr_token: "asc" }, skip: Math.max(0, offset - completedCount), take: remaining,
  }) : [];
  const ids = [...orderedIds, ...withoutCompleted.map((user) => user.id)];
  return { items: await summarizeUsers(ids, latestCompleted, now), total, page, total_pages: Math.ceil(total / PAGE_SIZE) };
}

/** Returns one CUSTOMER summary resolved only by public QR token. */
export async function getAdminUser(userQrToken: string, now = new Date()): Promise<AdminUserSummary | null> {
  const user = await prisma.user.findFirst({ where: { qr_token: userQrToken, role: "CUSTOMER" }, select: { id: true } });
  if (!user) return null;
  const latestCompleted = await prisma.order.findFirst({
    where: { user_id: user.id, status: "COMPLETED" }, select: { updated_at: true },
    orderBy: [{ updated_at: "desc" }, { id: "asc" }],
  });
  return (await summarizeUsers(
    [user.id],
    new Map(latestCompleted ? [[user.id, latestCompleted.updated_at]] : []),
    now,
  ))[0] ?? null;
}

/** Lists a CUSTOMER wallet with read-only effective expiry projection. */
export async function listAdminUserVouchers(userQrToken: string, page: number, now = new Date()): Promise<AdminUserPage<AdminUserVoucher> | null> {
  const user = await prisma.user.findFirst({ where: { qr_token: userQrToken, role: "CUSTOMER" }, select: { id: true } });
  if (!user) return null;
  const [total, rows] = await Promise.all([
    prisma.voucher.count({ where: { user_id: user.id } }),
    prisma.voucher.findMany({ where: { user_id: user.id }, include: { package: { select: { name: true, description: true } } },
      orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return { items: rows.map((row) => ({ qr_token: row.qr_token, name: row.package.name,
    description: row.package.description, status: effectiveAdminVoucherStatus(row.status, row.expires_at, now),
    expires_at: row.expires_at?.toISOString() ?? null, created_at: row.created_at.toISOString(),
    redeemed_at: row.redeemed_at?.toISOString() ?? null, issued_via: row.issued_via,
    days_remaining: adminVoucherDaysRemaining(row.expires_at, now),
  })), total, page, total_pages: Math.ceil(total / PAGE_SIZE) };
}

/** Lists active, unended voucher packages for the Admin gift picker. */
export async function listAdminUserVoucherPackages(page: number, category: AdminUserVoucherCategory, now = new Date()): Promise<AdminUserPage<AdminUserVoucherPackage>> {
  const voucherTypes: VoucherType[] | undefined = category === "DISCOUNT" ? ["DISCOUNT", "PRODUCT_DISCOUNT"] : category === "SHIPPING" ? ["FREESHIP"]
    : category === "GIFT" ? ["ITEM", "PRODUCT", "ADDON", "BUNDLE"] : undefined;
  const where: Prisma.VoucherPackageWhereInput = { is_active: true, OR: [{ ends_at: null }, { ends_at: { gt: now } }], ...(voucherTypes ? { voucher_type: { in: voucherTypes } } : {}) };
  const [total, rows] = await Promise.all([prisma.voucherPackage.count({ where }), prisma.voucherPackage.findMany({ where,
    select: { id: true, name: true, description: true, voucher_type: true }, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE })]);
  return { items: rows, total, page, total_pages: Math.ceil(total / PAGE_SIZE) };
}

const adminUserOrderInclude = {
  address: { select: { label: true } },
  discountVouchers: { include: { voucher: { select: { voucher_type: true, package: { select: { name: true } } } } } },
  items: { include: {
    menuItem: { select: { id: true, name: true, category: true, image_url: true } },
    selectedPowder: { select: { id: true, name: true } },
    milkType: { select: { id: true, name: true } },
    addons: { include: { addonOption: { select: { id: true, label: true, gram_value: true } } } },
    itemVoucher: { select: { package: { select: { name: true } } } },
    productVoucher: { select: { voucher_type: true, package: { select: { name: true } } } },
    addonVouchers: { include: { voucher: { select: { package: { select: { name: true } } } } } },
  } },
  bundleApplications: { include: {
    voucher: { select: { voucher_type: true, package: { select: { name: true } } } },
    qualifiers: { select: { order_item_id: true, quantity: true } },
    rewards: { select: {
      order_item_id: true, quantity: true, discount_vnd: true,
      orderItemAddon: { select: { order_item_id: true, addonOption: { select: { label: true } } } },
    } },
  } },
  pointsLogs: {
    where: { reason: { in: ["order_complete", "voucher_surplus", "order_complete_reversed", "voucher_surplus_reversed"] } },
    select: { reason: true, delta: true },
  },
} satisfies Prisma.OrderInclude;

type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof adminUserOrderInclude }>;
type AdminUserOrderDto = Omit<AdminUserOrder, "points_earned"> & { points_earned: number | null };

function pointsBreakdown(row: AdminOrderRow): AdminUserOrder["points_breakdown"] {
  if (row.status === "PENDING" || row.status === "ADMIN_CONFIRMED" || row.status === "STAFF_DONE") return null;
  if (row.status === "CANCELLED" && row.pointsLogs.length === 0) return null;
  if (row.status !== "COMPLETED" && row.status !== "CANCELLED") return null;
  const hasOrderComplete = row.pointsLogs.some((log) => log.reason === "order_complete");
  const loggedOrderPoints = row.pointsLogs.reduce((sum, log) =>
    log.reason === "order_complete" && log.delta > 0 ? sum + log.delta : sum, 0);
  const orderPoints = hasOrderComplete ? loggedOrderPoints
    : row.status === "COMPLETED" ? Math.max(0, row.points_earned ?? 0) : 0;
  const surplusPoints = row.pointsLogs.reduce((sum, log) =>
    log.reason === "voucher_surplus" && log.delta > 0 ? sum + log.delta : sum, 0);
  const reversedPoints = row.pointsLogs.reduce((sum, log) =>
    (log.reason === "order_complete_reversed" || log.reason === "voucher_surplus_reversed") && log.delta < 0
      ? sum + Math.abs(log.delta) : sum, 0);
  return {
    order_points: orderPoints,
    surplus_points: surplusPoints,
    reversed_points: reversedPoints,
    total_received: Math.max(0, orderPoints + surplusPoints - reversedPoints),
  };
}

function toAdminUserOrder(row: AdminOrderRow, freeshipName?: string): AdminUserOrderDto {
  const itemVouchers = row.items.flatMap((item) => [
    ...(item.itemVoucher ? [{ name: item.itemVoucher.package.name, type: "ITEM" }] : []),
    ...(item.productVoucher ? [{ name: item.productVoucher.package.name, type: item.productVoucher.voucher_type }] : []),
    ...item.addonVouchers.map(({ voucher }) => ({ name: voucher.package.name, type: "ADDON" })),
  ]);
  return {
    id: row.id, code: row.order_code, status: row.status, type: row.order_type,
    created_at: row.created_at.toISOString(), delivery_receiver_name: row.delivery_receiver_name,
    delivery_receiver_phone: row.delivery_receiver_phone, delivery_address: row.delivery_address,
    address_label: row.address?.label ?? null, subtotal_vnd: row.subtotal_vnd,
    item_discount_vnd: row.items.reduce((sum, item) => sum + item.total_discount_vnd, 0),
    total_voucher_discount_vnd: row.total_voucher_discount_vnd,
    shipping_fee_vnd: row.shipping_fee_vnd, freeship_discount_vnd: row.freeship_discount_vnd,
    grand_total_vnd: row.grand_total_vnd, points_earned: row.points_earned,
    points_breakdown: pointsBreakdown(row),
    items: row.items.map((item) => ({
      id: item.id, quantity: item.quantity, size: item.size, unit_price_vnd: item.unit_price_vnd,
      addons_price_vnd: item.addons_price_vnd,
      line_total_vnd: item.quantity * (item.unit_price_vnd + item.addons_price_vnd),
      line_payable_vnd: Math.max(0, item.quantity * (item.unit_price_vnd + item.addons_price_vnd) - item.total_discount_vnd),
      total_discount_vnd: item.total_discount_vnd, menu_item: item.menuItem,
      selected_powder: item.selectedPowder, base_liquid: item.milkType,
      sweetness: item.sweetness, ice_option: item.ice_option, coldwhisk: item.coldwhisk, note: item.note,
      addons: item.addons.map((addon) => ({
        id: addon.addonOption.id, label: addon.addonOption.label, quantity: addon.quantity,
        gram_value: addon.addonOption.gram_value?.toString() ?? null, unit_price_vnd: addon.unit_price_vnd,
      })),
      item_voucher: item.itemVoucher ? { name: item.itemVoucher.package.name } : null,
      product_voucher: item.productVoucher ? { name: item.productVoucher.package.name } : null,
      addon_vouchers: item.addonVouchers.map(({ voucher }) => ({ name: voucher.package.name })),
    })),
    order_vouchers: [
      ...row.discountVouchers.map(({ voucher }) => ({ name: voucher.package.name, type: voucher.voucher_type })),
      ...itemVouchers,
      ...row.bundleApplications.map(({ voucher }) => ({ name: voucher.package.name, type: voucher.voucher_type })),
      ...(freeshipName ? [{ name: freeshipName, type: "FREESHIP" }] : []),
    ],
    bundle_applications: row.bundleApplications.map((application) => ({
      id: application.id, name: application.voucher.package.name, status: application.status,
      qualifiers: application.qualifiers.map((value) => ({ order_item_id: value.order_item_id, quantity: value.quantity })),
      rewards: application.rewards.map((reward) => ({
        order_item_id: reward.order_item_id,
        parent_order_item_id: reward.orderItemAddon?.order_item_id ?? null,
        addon_label: reward.orderItemAddon?.addonOption.label ?? null,
        quantity: reward.quantity, discount_vnd: reward.discount_vnd,
      })),
    })),
  };
}

async function freeshipNames(rows: AdminOrderRow[]): Promise<Map<string, string>> {
  const ids = rows.flatMap((row) => row.freeship_voucher_id ? [row.freeship_voucher_id] : []);
  if (!ids.length) return new Map();
  const vouchers = await prisma.voucher.findMany({ where: { id: { in: ids } }, select: { id: true, package: { select: { name: true } } } });
  return new Map(vouchers.map((voucher) => [voucher.id, voucher.package.name]));
}

/** Lists ten orders constrained to one CUSTOMER resolved through its public QR token. */
export async function listAdminUserOrders(userQrToken: string, page: number): Promise<AdminUserPage<AdminUserOrderDto> | null> {
  const user = await prisma.user.findFirst({ where: { qr_token: userQrToken, role: "CUSTOMER" }, select: { id: true } });
  if (!user) return null;
  const where = { user_id: user.id };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: adminUserOrderInclude, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const names = await freeshipNames(rows);
  return { items: rows.map((row) => toAdminUserOrder(row, row.freeship_voucher_id ? names.get(row.freeship_voucher_id) : undefined)), total, page, total_pages: Math.ceil(total / PAGE_SIZE) };
}

/** Returns one order only when both its ID and resolved CUSTOMER owner match. */
export async function getAdminUserOrder(userQrToken: string, orderId: string): Promise<AdminUserOrderDto | null> {
  const user = await prisma.user.findFirst({ where: { qr_token: userQrToken, role: "CUSTOMER" }, select: { id: true } });
  if (!user) return null;
  const row = await prisma.order.findFirst({ where: { id: orderId, user_id: user.id }, include: adminUserOrderInclude });
  if (!row) return null;
  const names = await freeshipNames([row]);
  return toAdminUserOrder(row, row.freeship_voucher_id ? names.get(row.freeship_voucher_id) : undefined);
}
