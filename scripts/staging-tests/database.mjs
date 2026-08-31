import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { invariant, prerequisite } from "./errors.mjs";

const bundleInclude = { productScopes: { include: { sizes: true } }, addonRewards: true };
const voucherInclude = { menuItemScopes: true, package: { include: { bundleRule: { include: bundleInclude } } } };
const orderInclude = {
  items: { include: { addons: true, addonVouchers: true } }, discountVouchers: true,
  bundleApplications: { include: { rewards: true, qualifiers: true } }, pointsLogs: true,
};
const MAX_LEDGER_ROWS = 10_000;

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toJSON === "function") return canonical(value.toJSON());
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

/** Fingerprint input data independent of row ordering and Prisma Decimal representation. */
export function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Open a selects-only Prisma boundary; this runner never exposes a mutation client. */
export function openReadDatabase(databaseUrl) {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  client.$use(async (params, next) => {
    invariant(["findUnique", "findFirst", "findMany", "count", "groupBy"].includes(params.action), "DATABASE_WRITE_FORBIDDEN");
    return next(params);
  });
  return {
    async catalog() {
      const [items, powders, liquids, defaults, addonGroups, packages, schedules, closures] = await Promise.all([
        client.menuItem.findMany({ orderBy: { id: "asc" }, include: { sizes: true, fusionAllowedPowders: true, allowedBaseLiquids: true } }),
        client.matchaPowder.findMany({ orderBy: { id: "asc" }, include: { powderSizeConfigs: true } }),
        client.milkType.findMany({ orderBy: { id: "asc" } }),
        client.defaultSizeConfig.findMany(),
        client.addonGroup.findMany({ include: { options: true } }),
        client.voucherPackage.findMany({ orderBy: { id: "asc" }, include: { menuItemScopes: true, bundleRule: { include: bundleInclude }, _count: { select: { vouchers: true } } } }),
        client.storeSchedule.findMany(), client.storeTemporaryClosure.findMany(),
      ]);
      const snapshot = JSON.parse(JSON.stringify({ items, powders, liquids, defaults, addonGroups, packages, schedules, closures }));
      const stable = { ...snapshot, packages: snapshot.packages.map(pkg => Object.fromEntries(Object.entries(pkg).filter(([key]) => key !== "_count"))) };
      return { ...snapshot, fingerprint: fingerprint(stable) };
    },
    async actor(phone) {
      return client.user.findUnique({ where: { phone_number: phone }, select: {
        id: true, role: true, phone_number: true, qr_token: true, points_balance: true,
        addresses: { orderBy: { is_default: "desc" } },
      } });
    },
    async actorState(userId) {
      const [user, vouchers, ledger, sessions, grants] = await Promise.all([
        client.user.findUnique({ where: { id: userId }, select: { id: true, role: true, points_balance: true } }),
        client.voucher.findMany({ where: { user_id: userId }, include: voucherInclude }),
        client.pointsLog.findMany({ where: { user_id: userId }, orderBy: { id: "asc" }, take: MAX_LEDGER_ROWS + 1 }),
        client.session.findMany({ where: { user_id: userId }, select: { id: true, created_at: true, expires_at: true } }),
        client.voucherGrant.findMany({ where: { user_id: userId } }),
      ]);
      prerequisite(ledger.length <= MAX_LEDGER_ROWS, "LEDGER_READ_LIMIT");
      return JSON.parse(JSON.stringify({ user, vouchers, ledger, sessions, grants }));
    },
    async session(refreshToken) {
      return client.session.findUnique({ where: { refresh_token: refreshToken }, select: { id: true, user_id: true, expires_at: true } });
    },
    async sessionById(id) { return client.session.findUnique({ where: { id }, select: { id: true, user_id: true, expires_at: true } }); },
    async order(id) { return JSON.parse(JSON.stringify(await client.order.findUnique({ where: { id }, include: orderInclude }))); },
    async ordersByMarkers(markers) {
      invariant(markers.length > 0 && markers.length <= 200, "INVALID_MARKER_SCOPE");
      return JSON.parse(JSON.stringify(await client.order.findMany({
        where: { OR: [{ note: { in: markers } }, { items: { some: { note: { in: markers } } } }] }, include: orderInclude,
      })));
    },
    async pendingForUsers(userIds) {
      return client.order.findMany({ where: { user_id: { in: userIds }, status: { notIn: ["CANCELLED", "COMPLETED"] } }, select: { id: true } });
    },
    async recentOrders(userId) {
      return client.order.findMany({ where: { user_id: userId, order_type: { in: ["PICKUP", "DELIVERY"] }, created_at: { gt: new Date(Date.now() - 10 * 60_000) } }, select: { created_at: true } });
    },
    async vouchers(ids) { return JSON.parse(JSON.stringify(await client.voucher.findMany({ where: { id: { in: ids } }, include: voucherInclude }))); },
    async activeUses(ids) {
      if (!ids.length) return [];
      return client.order.findMany({ where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        OR: [
          { freeship_voucher_id: { in: ids } }, { discountVouchers: { some: { voucher_id: { in: ids } } } },
          { items: { some: { OR: [{ product_voucher_id: { in: ids } }, { item_voucher_id: { in: ids } }, { addonVouchers: { some: { voucher_id: { in: ids } } } }] } } },
          { bundleApplications: { some: { voucher_id: { in: ids }, status: { not: "CANCELLED" } } } },
        ],
      }, select: { id: true } });
    },
    async close() { await client.$disconnect(); },
  };
}
