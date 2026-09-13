import {
  AdminRewardError,
  getAdminRewardCampaign,
  toAdminRewardBoxDto,
  type AdminRewardBoxRecord,
  type AdminRewardDatabase,
} from "@/lib/adminRewardCampaign";
import {
  prepareRewardBoxImages,
  removeRewardBoxUrlsBestEffort,
  rollbackRewardBoxImages,
  type RewardBoxImageAdapter,
} from "@/lib/rewardBoxImage";

interface BoxFields { name: string; mouth_anchor_x: number; mouth_anchor_y: number }

/** Create a draft campaign box with uploads rolled back if the DB transaction fails. */
export async function createAdminRewardBox(
  db: AdminRewardDatabase,
  input: { campaignId: string; revision: number; fields: BoxFields; closedImage: File; openImage: File },
  adapter?: RewardBoxImageAdapter,
) {
  const images = await prepareRewardBoxImages({ name: input.fields.name, closedImage: input.closedImage, openImage: input.openImage }, adapter);
  let box: AdminRewardBoxRecord;
  try {
    box = await db.$transaction(async (tx) => {
      const campaign = await tx.rewardCampaign.findUnique({ where: { id: input.campaignId }, include: { boxes: true, poolItems: { include: { voucherPackage: true } } } });
      if (!campaign) throw new AdminRewardError("NOT_FOUND");
      if (campaign.status !== "DRAFT") throw new AdminRewardError("CAMPAIGN_NOT_DRAFT");
      if (campaign.boxes.length >= 12) throw new AdminRewardError("CAMPAIGN_NOT_READY");
      const claimed = await tx.rewardCampaign.updateMany({ where: { id: input.campaignId, status: "DRAFT", revision: input.revision }, data: { revision: { increment: 1 } } });
      if (claimed.count !== 1) throw new AdminRewardError("CONFLICT");
      const sortOrder = campaign.boxes.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      return tx.rewardBox.create({ data: {
        campaign_id: input.campaignId, ...input.fields, sort_order: sortOrder,
        closed_image_url: images.closed!.url, open_image_url: images.open!.url,
      } });
    });
  } catch (error) {
    await rollbackRewardBoxImages(images, adapter);
    throw error;
  }
  return { box: toAdminRewardBoxDto(box), campaign: await getAdminRewardCampaign(db, input.campaignId) };
}

/** Update mutable fields and optional images while a campaign is not ended. */
export async function updateAdminRewardBox(
  db: AdminRewardDatabase,
  input: { campaignId: string; boxId: string; revision: number; fields: Partial<BoxFields>; closedImage?: File; openImage?: File },
  adapter?: RewardBoxImageAdapter,
) {
  const before = await db.rewardBox.findFirst({ where: { id: input.boxId, campaign_id: input.campaignId } });
  if (!before) throw new AdminRewardError("NOT_FOUND");
  const images = await prepareRewardBoxImages({ name: input.fields.name ?? before.name, closedImage: input.closedImage, openImage: input.openImage }, adapter);
  let box: AdminRewardBoxRecord;
  try {
    box = await db.$transaction(async (tx) => {
      const campaign = await tx.rewardCampaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign) throw new AdminRewardError("NOT_FOUND");
      if (campaign.status === "ENDED") throw new AdminRewardError("CAMPAIGN_NOT_DRAFT");
      const current = await tx.rewardBox.findFirst({ where: { id: input.boxId, campaign_id: input.campaignId } });
      if (!current) throw new AdminRewardError("NOT_FOUND");
      if (campaign.status !== "DRAFT" && input.fields.name !== undefined && input.fields.name !== current.name) {
        throw new AdminRewardError("CAMPAIGN_NOT_DRAFT");
      }
      const claimed = await tx.rewardCampaign.updateMany({ where: { id: input.campaignId, status: campaign.status, revision: input.revision }, data: { revision: { increment: 1 } } });
      if (claimed.count !== 1) throw new AdminRewardError("CONFLICT");
      return tx.rewardBox.update({ where: { id: input.boxId }, data: {
        ...input.fields,
        ...(images.closed && { closed_image_url: images.closed.url }),
        ...(images.open && { open_image_url: images.open.url }),
      } });
    });
  } catch (error) {
    await rollbackRewardBoxImages(images, adapter);
    throw error;
  }
  await removeRewardBoxUrlsBestEffort([
    images.closed ? before.closed_image_url : null,
    images.open ? before.open_image_url : null,
  ], adapter);
  return { box: toAdminRewardBoxDto(box), campaign: await getAdminRewardCampaign(db, input.campaignId) };
}

/** Delete one draft campaign box and best-effort remove its committed images. */
export async function deleteAdminRewardBox(db: AdminRewardDatabase, campaignId: string, boxId: string, revision: number, adapter?: RewardBoxImageAdapter) {
  const box = await db.$transaction(async (tx) => {
    const campaign = await tx.rewardCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new AdminRewardError("NOT_FOUND");
    if (campaign.status !== "DRAFT") throw new AdminRewardError("CAMPAIGN_NOT_DRAFT");
    const current = await tx.rewardBox.findFirst({ where: { id: boxId, campaign_id: campaignId } });
    if (!current) throw new AdminRewardError("NOT_FOUND");
    const claimed = await tx.rewardCampaign.updateMany({ where: { id: campaignId, status: "DRAFT", revision }, data: { revision: { increment: 1 } } });
    if (claimed.count !== 1) throw new AdminRewardError("CONFLICT");
    return tx.rewardBox.delete({ where: { id: boxId } });
  });
  await removeRewardBoxUrlsBestEffort([box.closed_image_url, box.open_image_url], adapter);
  return { deleted: true as const, revision: revision + 1 };
}
