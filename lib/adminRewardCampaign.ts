import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdminRewardBox,
  AdminRewardCampaign,
  AdminRewardCampaignAction,
  AdminRewardCampaignStatus,
  AdminRewardCampaignSummary,
  AdminRewardPoolInput,
} from "@/contracts/admin/reward";
import {
  loadVoucherAvailabilityCatalog,
  resolveVoucherTargetAvailability,
  type VoucherAvailabilityCatalog,
  type VoucherAvailabilityDatabase,
  type VoucherBundleRuleSource,
  type VoucherTargetAvailabilitySource,
} from "@/lib/voucherAvailability";

export type CampaignStatus = AdminRewardCampaignStatus;
export type CampaignAction = AdminRewardCampaignAction["action"];

export type AdminRewardReason =
  | "CAMPAIGN_NOT_DRAFT"
  | "INVALID_TRANSITION"
  | "CAMPAIGN_NOT_READY"
  | "UNREACHABLE_UNLOCK_THRESHOLD"
  | "PACKAGE_UNAVAILABLE"
  | "NOT_FOUND"
  | "CONFLICT";

export class AdminRewardError extends Error {
  constructor(public readonly reason: AdminRewardReason) {
    super(reason);
  }
}

export type RewardPoolInput = AdminRewardPoolInput;

interface PackageRecord {
  id: string; name: string; is_active: boolean; ends_at: Date | null;
  voucher_type: VoucherTargetAvailabilitySource["voucher_type"];
  menu_item_id: VoucherTargetAvailabilitySource["menu_item_id"];
  size: VoucherTargetAvailabilitySource["size"];
  eligible_sizes?: VoucherTargetAvailabilitySource["eligible_sizes"];
  reference_size?: VoucherTargetAvailabilitySource["reference_size"];
  product_discount_mode?: VoucherTargetAvailabilitySource["product_discount_mode"];
  menuItemScopes?: VoucherTargetAvailabilitySource["menuItemScopes"];
  matcha_powder_id: VoucherTargetAvailabilitySource["matcha_powder_id"];
  milk_type_id: VoucherTargetAvailabilitySource["milk_type_id"];
  addon_option_id: VoucherTargetAvailabilitySource["addon_option_id"];
  addonOptionScopes?: VoucherTargetAvailabilitySource["addonOptionScopes"];
  bundleRule?: VoucherBundleRuleSource | null;
}
interface PoolRecord extends RewardPoolInput { id: string; created_at: Date; voucherPackage: PackageRecord }
export interface AdminRewardBoxRecord {
  id: string; name: string; closed_image_url: string; open_image_url: string;
  mouth_anchor_x: unknown; mouth_anchor_y: unknown; sort_order: number;
}
interface CampaignRecord {
  id: string; name: string; status: CampaignStatus; revision: number; created_at: Date; updated_at: Date;
  poolItems: PoolRecord[]; boxes: AdminRewardBoxRecord[];
}
interface CountRow { campaign_id: string | null; pool_item_id: string | null; _count: { _all: number } }

export interface AdminRewardTransaction extends VoucherAvailabilityDatabase {
  rewardCampaign: Pick<Prisma.TransactionClient["rewardCampaign"], "findUnique" | "findMany" | "create" | "updateMany">;
  rewardPoolItem: Pick<Prisma.TransactionClient["rewardPoolItem"], "deleteMany" | "createMany">;
  rewardBox: Pick<Prisma.TransactionClient["rewardBox"], "findFirst" | "create" | "update" | "delete">;
  rewardOutcome: Pick<Prisma.TransactionClient["rewardOutcome"], "groupBy">;
  voucherPackage: Pick<Prisma.TransactionClient["voucherPackage"], "findMany" | "findUnique">;
  welcomeRewardSettings: Pick<Prisma.TransactionClient["welcomeRewardSettings"], "findUnique" | "create" | "updateMany">;
}

export interface AdminRewardDatabase extends AdminRewardTransaction {
  $transaction: PrismaClient["$transaction"];
}

/** Validate allocation size and unlock reachability, returning total stock. */
export function validateRewardPoolItems(items: RewardPoolInput[]): number {
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  for (const threshold of new Set(items.map((item) => item.unlock_after_draws).filter((value) => value > 0))) {
    const earlier = items.filter((item) => item.unlock_after_draws < threshold)
      .reduce((sum, item) => sum + item.quantity, 0);
    if (earlier < threshold) throw new AdminRewardError("UNREACHABLE_UNLOCK_THRESHOLD");
  }
  return total;
}

/** Resolve an allowed campaign status transition. */
export function resolveCampaignTransition(status: CampaignStatus, action: CampaignAction): CampaignStatus {
  if (action === "ACTIVATE" && status === "DRAFT") return "ACTIVE";
  if (action === "PAUSE" && status === "ACTIVE") return "PAUSED";
  if (action === "RESUME" && status === "PAUSED") return "ACTIVE";
  if (action === "END" && (status === "ACTIVE" || status === "PAUSED")) return "ENDED";
  throw new AdminRewardError("INVALID_TRANSITION");
}

function packageAvailable(pkg: PackageRecord, now: Date): boolean {
  return pkg.is_active && (!pkg.ends_at || pkg.ends_at > now);
}

function packageTargetSource(pkg: PackageRecord): VoucherTargetAvailabilitySource {
  return {
    voucher_type: pkg.voucher_type, menu_item_id: pkg.menu_item_id, size: pkg.size,
    eligible_sizes: pkg.eligible_sizes, reference_size: pkg.reference_size,
    product_discount_mode: pkg.product_discount_mode, menuItemScopes: pkg.menuItemScopes,
    matcha_powder_id: pkg.matcha_powder_id, milk_type_id: pkg.milk_type_id,
    addon_option_id: pkg.addon_option_id, addonOptionScopes: pkg.addonOptionScopes,
    package: { bundleRule: pkg.bundleRule },
  };
}

function packageEligible(pkg: PackageRecord, catalog: VoucherAvailabilityCatalog, now: Date): boolean {
  return packageAvailable(pkg, now) && resolveVoucherTargetAvailability(packageTargetSource(pkg), catalog).availability.can_apply;
}

/** Project one persisted reward box into the numeric-anchor admin API contract. */
export function toAdminRewardBoxDto(box: AdminRewardBoxRecord): AdminRewardBox {
  return {
    id: box.id, name: box.name, closed_image_url: box.closed_image_url, open_image_url: box.open_image_url,
    mouth_anchor_x: Number(box.mouth_anchor_x), mouth_anchor_y: Number(box.mouth_anchor_y), sort_order: box.sort_order,
  };
}

async function assertPackages(db: AdminRewardTransaction, ids: string[], now: Date): Promise<void> {
  const packages = await db.voucherPackage.findMany({ where: { id: { in: ids } } });
  if (packages.length !== ids.length || packages.some((pkg) => !packageAvailable(pkg, now))) {
    throw new AdminRewardError("PACKAGE_UNAVAILABLE");
  }
}

const TARGET_PACKAGE_INCLUDE = {
  addonOption: { include: { group: true } },
  bundleRule: {
    include: { productScopes: { include: { sizes: true } }, addonRewards: true },
  },
  menuItemScopes: {
    select: {
      menu_item_id: true, size: true, matcha_powder_id: true,
      milk_type_id: true, covered_price_vnd: true,
    },
    orderBy: { menu_item_id: "asc" as const },
  },
  addonOptionScopes: {
    select: { addon_option_id: true },
    orderBy: { addon_option_id: "asc" as const },
  },
} satisfies Prisma.VoucherPackageInclude;

async function assertReady(db: AdminRewardTransaction, campaign: CampaignRecord, now: Date): Promise<VoucherAvailabilityCatalog> {
  if (campaign.boxes.length < 3 || campaign.boxes.length > 12 || campaign.poolItems.length === 0) {
    throw new AdminRewardError("CAMPAIGN_NOT_READY");
  }
  validateRewardPoolItems(campaign.poolItems);
  const packages = campaign.poolItems.map((item) => item.voucherPackage);
  const catalog = await loadVoucherAvailabilityCatalog(db);
  if (packages.some((pkg) => !packageEligible(pkg, catalog, now))) throw new AdminRewardError("PACKAGE_UNAVAILABLE");
  return catalog;
}

function mapCampaign(
  campaign: CampaignRecord,
  counts: CountRow[],
  catalog: VoucherAvailabilityCatalog,
  now: Date,
): AdminRewardCampaign {
  const issuedByPool = new Map(counts.filter((row) => row.campaign_id === campaign.id)
    .map((row) => [row.pool_item_id, row._count._all]));
  const drawCount = [...issuedByPool.values()].reduce((sum, count) => sum + count, 0);
  const weights = campaign.poolItems.map((item) => {
    const issued = issuedByPool.get(item.id) ?? 0;
    const remaining = Math.max(item.quantity - issued, 0);
    const unlocked = item.unlock_after_draws <= drawCount;
    return { item, issued, remaining, unlocked, weight: unlocked && packageEligible(item.voucherPackage, catalog, now) ? remaining : 0 };
  });
  const eligibleWeightTotal = weights.reduce((sum, row) => sum + row.weight, 0);
  const summary = {
    id: campaign.id, name: campaign.name, status: campaign.status, revision: campaign.revision,
    created_at: campaign.created_at.toISOString(), updated_at: campaign.updated_at.toISOString(), draw_count: drawCount,
    total_allocated: campaign.poolItems.reduce((sum, item) => sum + item.quantity, 0),
    total_remaining: weights.reduce((sum, row) => sum + row.remaining, 0), box_count: campaign.boxes.length,
  };
  return {
    ...summary,
    pool_items: weights.sort((a, b) => a.item.created_at.getTime() - b.item.created_at.getTime() || a.item.id.localeCompare(b.item.id)).map(({ item, issued, remaining, unlocked, weight }) => ({
      id: item.id, voucher_package_id: item.voucher_package_id,
      voucher_package: {
        name: item.voucherPackage.name,
        is_active: item.voucherPackage.is_active,
        ends_at: item.voucherPackage.ends_at?.toISOString() ?? null,
      },
      quantity: item.quantity, unlock_after_draws: item.unlock_after_draws, issued_count: issued,
      remaining_quantity: remaining, unlocked, current_weight: weight, eligible_weight_total: eligibleWeightTotal,
    })),
    boxes: [...campaign.boxes].sort((a, b) => a.sort_order - b.sort_order).map(toAdminRewardBoxDto),
  };
}

const CAMPAIGN_QUERY = {
  include: { poolItems: { include: { voucherPackage: { include: TARGET_PACKAGE_INCLUDE } } }, boxes: true },
};

/** Load one campaign detail with committed voucher draw statistics. */
export async function getAdminRewardCampaign(
  db: AdminRewardTransaction,
  id: string,
  now = new Date(),
  catalog?: VoucherAvailabilityCatalog,
): Promise<AdminRewardCampaign> {
  const campaign = await db.rewardCampaign.findUnique({ where: { id }, ...CAMPAIGN_QUERY });
  if (!campaign) throw new AdminRewardError("NOT_FOUND");
  const counts = await db.rewardOutcome.groupBy({ by: ["campaign_id", "pool_item_id"], where: { campaign_id: id, kind: "VOUCHER" }, _count: { _all: true } });
  return mapCampaign(campaign, counts, catalog ?? await loadVoucherAvailabilityCatalog(db), now);
}

/** List campaign summaries newest first with committed voucher draw statistics. */
export async function listAdminRewardCampaigns(
  db: AdminRewardTransaction,
  now = new Date(),
): Promise<AdminRewardCampaignSummary[]> {
  const campaigns = await db.rewardCampaign.findMany({ orderBy: { created_at: "desc" }, ...CAMPAIGN_QUERY });
  const counts = await db.rewardOutcome.groupBy({ by: ["campaign_id", "pool_item_id"], where: { kind: "VOUCHER" }, _count: { _all: true } });
  const catalog = await loadVoucherAvailabilityCatalog(db);
  return campaigns.map((campaign) => {
    const detail = mapCampaign(campaign, counts, catalog, now);
    return {
      id: detail.id, name: detail.name, status: detail.status, revision: detail.revision,
      created_at: detail.created_at, updated_at: detail.updated_at, draw_count: detail.draw_count,
      total_allocated: detail.total_allocated, total_remaining: detail.total_remaining, box_count: detail.box_count,
    };
  });
}

/** Create a new draft reward campaign. */
export async function createAdminRewardCampaign(db: AdminRewardTransaction, name: string) {
  return db.rewardCampaign.create({ data: { name }, ...CAMPAIGN_QUERY });
}

/** Replace a draft campaign pool atomically and claim its revision. */
export async function replaceAdminRewardPool(db: AdminRewardDatabase, id: string, revision: number, items: RewardPoolInput[], now = new Date()) {
  validateRewardPoolItems(items);
  return db.$transaction(async (tx) => {
    const campaign = await tx.rewardCampaign.findUnique({ where: { id }, ...CAMPAIGN_QUERY });
    if (!campaign) throw new AdminRewardError("NOT_FOUND");
    if (campaign.status !== "DRAFT") throw new AdminRewardError("CAMPAIGN_NOT_DRAFT");
    await assertPackages(tx, items.map((item) => item.voucher_package_id), now);
    const claimed = await tx.rewardCampaign.updateMany({ where: { id, status: "DRAFT", revision }, data: { revision: { increment: 1 } } });
    if (claimed.count !== 1) throw new AdminRewardError("CONFLICT");
    await tx.rewardPoolItem.deleteMany({ where: { campaign_id: id } });
    await tx.rewardPoolItem.createMany({ data: items.map((item) => ({ campaign_id: id, ...item })) });
    return getAdminRewardCampaign(tx, id, now);
  });
}

/** Rename or transition a campaign with conditional revision protection. */
export async function mutateAdminRewardCampaign(
  db: AdminRewardDatabase,
  id: string,
  input: AdminRewardCampaignAction,
  now = new Date(),
): Promise<AdminRewardCampaign> {
  return db.$transaction(async (tx) => {
    const campaign = await tx.rewardCampaign.findUnique({ where: { id }, ...CAMPAIGN_QUERY });
    if (!campaign) throw new AdminRewardError("NOT_FOUND");
    let readinessCatalog: VoucherAvailabilityCatalog | undefined;
    if (input.action === "RENAME") {
      if (campaign.status !== "DRAFT") throw new AdminRewardError("CAMPAIGN_NOT_DRAFT");
    } else {
      resolveCampaignTransition(campaign.status, input.action);
      if (input.action === "ACTIVATE" || input.action === "RESUME") readinessCatalog = await assertReady(tx, campaign, now);
    }
    const nextStatus = input.action === "RENAME" ? campaign.status : resolveCampaignTransition(campaign.status, input.action);
    const updated = await tx.rewardCampaign.updateMany({
      where: { id, status: campaign.status, revision: input.revision },
      data: {
        status: nextStatus,
        ...(input.action === "RENAME" ? { name: input.name } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new AdminRewardError("CONFLICT");
    return getAdminRewardCampaign(tx, id, now, readinessCatalog);
  });
}
