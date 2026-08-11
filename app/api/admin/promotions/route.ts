import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPromotionSchema } from "@/lib/validations/promotion";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.role === "ADMIN";
}

class InvalidPromotionReferenceError extends Error {}

/** GET /api/admin/promotions — List BUNDLE campaigns and immutable published rules. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const promotions = await prisma.promotion.findMany({
    orderBy: { created_at: "desc" },
    include: {
      voucherPackage: true,
      bundleRule: { include: { productScopes: true, addonRewards: true } },
    },
  });
  return NextResponse.json({ data: promotions });
}

/** POST /api/admin/promotions — Atomically publish one immutable BUNDLE campaign. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = createPromotionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        code: "VALIDATION_ERROR",
        details: { issues: parsed.error.issues },
      },
      { status: 400 },
    );
  }
  const input = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const menuItemIds = [...new Set([
        ...input.bundle_rule.qualifier_scopes.map((scope) => scope.menu_item_id),
        ...input.bundle_rule.reward_product_scopes.map((scope) => scope.menu_item_id),
      ])];
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: menuItemIds }, is_available: true },
        select: { id: true, category: true },
      });
      if (menuItems.length !== menuItemIds.length) {
        throw new InvalidPromotionReferenceError("Menu item is unavailable");
      }

      const powderIds = [...new Set(input.bundle_rule.reward_product_scopes.flatMap(
        (scope) => scope.powder_id ? [scope.powder_id] : [],
      ))];
      if (powderIds.length > 0) {
        const powders = await tx.matchaPowder.findMany({
          where: { id: { in: powderIds }, is_available: true },
          select: { id: true },
        });
        if (powders.length !== powderIds.length) {
          throw new InvalidPromotionReferenceError("Powder is unavailable");
        }
      }
      const milkIds = [...new Set(input.bundle_rule.reward_product_scopes.flatMap(
        (scope) => scope.milk_type_id ? [scope.milk_type_id] : [],
      ))];
      if (milkIds.length > 0) {
        const milks = await tx.milkType.findMany({
          where: { id: { in: milkIds } },
          select: { id: true },
        });
        if (milks.length !== milkIds.length) {
          throw new InvalidPromotionReferenceError("Milk type does not exist");
        }
      }
      if (input.bundle_rule.reward_mode === "FIXED_CONFIG") {
        const menuById = new Map(menuItems.map((item) => [item.id, item]));
        for (const scope of input.bundle_rule.reward_product_scopes) {
          const category = menuById.get(scope.menu_item_id)?.category;
          if (
            (category === "latte" && !scope.milk_type_id) ||
            (category === "fusion" && scope.milk_type_id)
          ) {
            throw new InvalidPromotionReferenceError("Fixed milk configuration is invalid");
          }
        }
      }
      const addonIds = input.bundle_rule.reward_addon_option_ids;
      if (addonIds.length > 0) {
        const addons = await tx.addonOption.findMany({
          where: {
            id: { in: addonIds },
            gram_value: null,
            group: { is_active: true },
          },
          select: { id: true },
        });
        if (addons.length !== addonIds.length) {
          throw new InvalidPromotionReferenceError("Addon is unavailable or Extra Matcha");
        }
      }

      return tx.voucherPackage.create({
        data: {
          name: input.package.name,
          description: input.description ?? null,
          voucher_type: "BUNDLE",
          acquisition_mode: input.package.acquisition_mode,
          points_cost: input.package.points_cost,
          included_addon_option_ids: [],
          is_active: true,
          expires_after_days: input.package.expires_after_days ?? null,
          quantity: input.package.quantity ?? null,
          max_per_user: input.package.max_per_user,
          promotion: {
            create: {
              title: input.title,
              description: input.description ?? null,
              starts_at: new Date(input.starts_at),
              ends_at: new Date(input.ends_at),
              max_redemptions: input.max_redemptions,
              is_active: true,
              published_at: new Date(),
              bundleRule: {
                create: {
                  buy_quantity: input.bundle_rule.buy_quantity,
                  reward_quantity: input.bundle_rule.reward_quantity,
                  reward_kind: input.bundle_rule.reward_kind,
                  reward_mode: input.bundle_rule.reward_mode,
                  benefit_scaling: input.bundle_rule.benefit_scaling,
                  max_applications_order: input.bundle_rule.max_applications_per_order,
                  max_reward_units_order: input.bundle_rule.max_reward_units_per_order ?? null,
                  productScopes: {
                    create: [
                      ...input.bundle_rule.qualifier_scopes.map((scope) => ({
                        role: "QUALIFIER" as const,
                        menu_item_id: scope.menu_item_id,
                        size: scope.size ?? null,
                        matcha_powder_id: scope.powder_id ?? null,
                        milk_type_id: scope.milk_type_id ?? null,
                        reference_price_vnd: scope.reference_price_vnd ?? null,
                      })),
                      ...input.bundle_rule.reward_product_scopes.map((scope) => ({
                        role: "REWARD" as const,
                        menu_item_id: scope.menu_item_id,
                        size: scope.size ?? null,
                        matcha_powder_id: scope.powder_id ?? null,
                        milk_type_id: scope.milk_type_id ?? null,
                        reference_price_vnd: scope.reference_price_vnd ?? null,
                      })),
                    ],
                  },
                  addonRewards: {
                    create: input.bundle_rule.reward_addon_option_ids.map((addonOptionId) => ({
                      addon_option_id: addonOptionId,
                    })),
                  },
                },
              },
            },
          },
        },
        include: { promotion: true },
      });
    });
    return NextResponse.json({ data: result.promotion }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidPromotionReferenceError) {
      return NextResponse.json(
        { error: error.message, code: "INVALID_PROMOTION_REFERENCE" },
        { status: 400 },
      );
    }
    console.error("[POST /api/admin/promotions]", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
