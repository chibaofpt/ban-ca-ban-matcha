import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import { withCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";

/** GET /api/powders — public, no auth required. */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await withCache<PowderApiResponse>(CACHE_KEYS.POWDERS, CACHE_TTL.POWDERS, fetchPowdersData);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/powders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/** Fetches and builds powder data from DB. Called by withCache on cache miss. */
async function fetchPowdersData(): Promise<PowderApiResponse> {
  const [powders, defaultSizeConfigs] = await Promise.all([
    prisma.matchaPowder.findMany({
      where: { is_available: true },
      orderBy: { name: "asc" },
      include: {
        powderSizeConfigs: true,
      },
    }),
    prisma.defaultSizeConfig.findMany(),
  ]);

  return {
    data: powders.map((p) => ({
      id: p.id,
      name: p.name,
      manufacturer: p.manufacturer ?? null,
      description: p.description ?? null,
      image_url: p.image_url ?? null,
      price_per_gram: p.price_per_gram,
      type: p.type,
      fragrance: p.fragrance ?? null,
      body: p.body ?? null,
      bitterness: p.bitterness ?? null,
      umami: p.umami ?? null,
      color: p.color ?? null,
      is_available: p.is_available,
      reference_latte_item_id: p.reference_latte_item_id,
      size_config: p.powderSizeConfigs.map((c) => ({
        size: c.size,
        grams: Number(c.grams),
      })),
    })),
    default_powder_gram: defaultSizeConfigs.map((c) => ({
      size: c.size,
      grams: Number(c.powder_gram),
    })),
  };
}
