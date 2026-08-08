import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { runMenuImageCleanup } from "@/lib/menuImageCleanup";
import { captureServerException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** GET /api/cron/cleanup-menu-images — report or delete old orphaned menu images. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  try {
    const result = await runMenuImageCleanup({
      dryRun: process.env.IMAGE_CLEANUP_DRY_RUN !== "false",
    });
    if (result.failed > 0) {
      return NextResponse.json(
        {
          error: "Some menu images could not be removed",
          code: "INTERNAL_ERROR",
          details: result,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    captureServerException(error, { operation: "menu_image_cleanup_route" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
