import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { AdminRewardError, validateRewardPoolItems } from "@/lib/adminRewardCampaign";
import { RewardBoxImageError } from "@/lib/rewardBoxImage";

const uuid = z.string().uuid();
export const campaignCreateSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const campaignActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RENAME"), name: z.string().trim().min(1).max(100), revision: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("ACTIVATE"), revision: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("PAUSE"), revision: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("RESUME"), revision: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("END"), revision: z.number().int().min(0) }).strict(),
]);
export const poolSchema = z.object({
  revision: z.number().int().min(0),
  items: z.array(z.object({
    voucher_package_id: uuid, quantity: z.number().int().min(1).max(10_000),
    unlock_after_draws: z.number().int().min(0).max(99_999),
  }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.voucher_package_id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Duplicate package" });
  const total = value.items.reduce((sum, item) => sum + item.quantity, 0);
  if (total > 100_000) context.addIssue({ code: "custom", message: "Total allocation too large" });
  if (value.items.some((item) => item.unlock_after_draws >= total)) context.addIssue({ code: "custom", message: "Unlock threshold exceeds allocation" });
});
export const settingsSchema = z.object({
  mode: z.enum(["POINTS", "FIXED_VOUCHER", "GACHA"]),
  fixed_package_id: uuid.nullish(), active_campaign_id: uuid.nullish(), revision: z.number().int().min(0),
}).strict().superRefine((value, context) => {
  const fixed = value.fixed_package_id ?? null;
  const campaign = value.active_campaign_id ?? null;
  const valid = value.mode === "POINTS" ? fixed === null && campaign === null
    : value.mode === "FIXED_VOUCHER" ? fixed !== null && campaign === null
      : campaign !== null && fixed === null;
  if (!valid) context.addIssue({ code: "custom", message: "Mode references are invalid" });
});
export const revisionSchema = z.object({ revision: z.number().int().min(0) }).strict();

/** Return a validation response when any dynamic reward route id is not a UUID. */
export function invalidRewardRouteIds(ids: string[]): NextResponse | null {
  return ids.every((id) => uuid.safeParse(id).success)
    ? null
    : NextResponse.json({ error: "Invalid route id", code: "VALIDATION_ERROR" }, { status: 400 });
}

export interface ParsedBoxForm {
  revision: number;
  name?: string;
  mouth_anchor_x?: number;
  mouth_anchor_y?: number;
  closedImage?: File;
  openImage?: File;
}

/** Return the canonical auth error unless the current session is ADMIN. */
export async function requireRewardAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  return null;
}

/** Parse bounded reward-box multipart fields after route authentication. */
export async function parseRewardBoxForm(req: Request, requireImages: boolean): Promise<ParsedBoxForm | null> {
  const length = req.headers.get("content-length");
  if (length && Number(length) > 4.5 * 1024 * 1024) return null;
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const allowed = new Set(["revision", "name", "mouth_anchor_x", "mouth_anchor_y", "closed_image", "open_image"]);
  if ([...form.keys()].some((key) => !allowed.has(key))) return null;
  const file = (key: string) => {
    const value = form.get(key);
    return value instanceof File && value.size > 0 ? value : undefined;
  };
  const revisionToken = form.get("revision");
  if (typeof revisionToken !== "string" || !/^(0|[1-9]\d*)$/.test(revisionToken)) return null;
  const revision = Number(revisionToken);
  if (!Number.isSafeInteger(revision)) return null;
  const raw = {
    revision, name: form.get("name"),
    mouth_anchor_x: form.get("mouth_anchor_x"), mouth_anchor_y: form.get("mouth_anchor_y"),
    closedImage: file("closed_image"), openImage: file("open_image"),
  };
  const optionalNumber = z.preprocess((value) => value === null ? undefined : Number(value), z.number().min(0).max(1).optional());
  const parsed = z.object({
    revision: z.number().int().min(0),
    name: z.preprocess((value) => value === null ? undefined : value, z.string().trim().min(1).max(80).optional()),
    mouth_anchor_x: optionalNumber, mouth_anchor_y: optionalNumber,
    closedImage: z.instanceof(File).optional(), openImage: z.instanceof(File).optional(),
  }).safeParse(raw);
  if (!parsed.success || (requireImages && (!parsed.data.closedImage || !parsed.data.openImage))) return null;
  if (!requireImages && parsed.data.name === undefined && parsed.data.mouth_anchor_x === undefined &&
    parsed.data.mouth_anchor_y === undefined && !parsed.data.closedImage && !parsed.data.openImage) return null;
  return parsed.data;
}

/** Map known admin reward workflow and image errors to the stable HTTP contract. */
export function adminRewardErrorResponse(error: unknown): NextResponse {
  if (error instanceof RewardBoxImageError || (error instanceof Error && ["INVALID_DECODED_IMAGE_FORMAT"].includes(error.message))) {
    const reason = error instanceof RewardBoxImageError ? error.reason : error.message;
    return NextResponse.json({ error: "Invalid reward box image", code: "VALIDATION_ERROR", details: { reason } }, { status: 400 });
  }
  if (error instanceof AdminRewardError) {
    if (error.reason === "NOT_FOUND") return NextResponse.json({ error: "Reward campaign not found", code: "NOT_FOUND" }, { status: 404 });
    if (error.reason === "CONFLICT") return NextResponse.json({ error: "Reward campaign conflict", code: "CONFLICT" }, { status: 409 });
    return NextResponse.json({ error: "Reward campaign rule violation", code: "BUSINESS_RULE_VIOLATION", details: { reason: error.reason } }, { status: 422 });
  }
  console.error("[admin-reward]", error);
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
}

/** Validate pool reachability after structural request parsing. */
export function validatePoolReachability(items: z.infer<typeof poolSchema>["items"]): void {
  validateRewardPoolItems(items);
}
