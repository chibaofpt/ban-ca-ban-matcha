import { pathToFileURL } from "node:url";

const candidateWhere = { order_type: "COUNTER", payment_method: "BANK_TRANSFER", status: "COMPLETED" };
const include = { bundleApplications: { include: { voucher: true } } };

function inspect(order) {
  if (!order || order.order_type !== "COUNTER" || order.payment_method !== "BANK_TRANSFER" || order.status !== "COMPLETED") return "ORDER_STATE_MISMATCH";
  if (!order.payment_confirmed_at || !order.payment_confirmed_by) return "MISSING_PAYMENT_AUDIT";
  if (!order.user_id) return "MISSING_CUSTOMER";
  if (!order.bundleApplications.length) return "NO_APPLICATIONS";
  const pending = order.bundleApplications.filter((app) => app.status === "RESERVED");
  if (!pending.length) return "ALREADY_SETTLED";
  for (const app of pending) {
    const voucher = app.voucher;
    if (voucher.user_id !== order.user_id) return "OWNER_MISMATCH";
    if (voucher.voucher_type !== "BUNDLE" || voucher.status !== "RESERVED") return "VOUCHER_STATE_MISMATCH";
    if (voucher.redeemed_at || voucher.redeemed_by || voucher.used_channel) return "CONFLICTING_REDEMPTION_AUDIT";
  }
  return "ELIGIBLE";
}

/** Inspect completed counter-transfer bundle reservations; dry-run is the default. */
export async function repairCounterBundles(db, options = {}) {
  const apply = options.apply === true;
  const orderIds = options.orderIds ?? [];
  if (apply && (!orderIds.length || orderIds.length > 1000)) throw new Error("APPLY_REQUIRES_EXACT_ORDER_IDS_MAX_1000");
  if (orderIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error("INVALID_ORDER_IDS");
  const results = [];
  let cursor;
  for (;;) {
    const page = await db.order.findMany({
      where: { ...candidateWhere, ...(orderIds.length ? { id: { in: orderIds } } : {}) },
      include, take: 100, orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const order of page) {
      let reason = inspect(order);
      if (apply && reason === "ELIGIBLE") {
        try {
          reason = await db.$transaction(async (tx) => {
            const current = await tx.order.findUnique({ where: { id: order.id }, include });
            const checked = inspect(current);
            if (checked !== "ELIGIBLE") return checked;
            for (const app of current.bundleApplications.filter((entry) => entry.status === "RESERVED")) {
              const changed = await tx.orderBundleApplication.updateMany({
                where: { id: app.id, order_id: current.id, voucher_id: app.voucher_id, status: "RESERVED" },
                data: { status: "REDEEMED" },
              });
              const voucher = await tx.voucher.updateMany({
                where: { id: app.voucher_id, user_id: current.user_id, voucher_type: "BUNDLE", status: "RESERVED", redeemed_at: null, redeemed_by: null, used_channel: null },
                data: { status: "REDEEMED", redeemed_at: current.payment_confirmed_at, redeemed_by: current.payment_confirmed_by, used_channel: "OFFLINE" },
              });
              if (changed.count !== 1 || voucher.count !== 1) throw new Error("CONCURRENT_STATE_CHANGE");
            }
            return "APPLIED";
          }, { isolationLevel: "Serializable", timeout: 10000 });
        } catch {
          reason = "TRANSACTION_ABORTED";
        }
      }
      results.push({ orderId: order.id, reason });
    }
    if (page.length < 100) break;
    cursor = page.at(-1).id;
  }
  return { mode: apply ? "apply" : "dry-run", results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--order-ids="))) {
    console.error("INVALID_ARGUMENTS"); process.exitCode = 1;
  } else {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
      const result = await repairCounterBundles(db, {
        apply: args.includes("--apply"),
        orderIds: args.find((arg) => arg.startsWith("--order-ids="))?.slice(12).split(",") ?? [],
      });
      console.log(JSON.stringify(result));
    } catch {
      console.error("REPAIR_FAILED_CHECK_ARGUMENTS_AND_DATABASE"); process.exitCode = 1;
    } finally { await db.$disconnect(); }
  }
}
