import { NextResponse } from "next/server";
import { getRegistrationOtpBalance, requireRegistrationOtpAdmin } from "@/lib/auth/registrationOtpAdmin";
import { registrationOtpErrorResponse } from "@/lib/auth/registrationOtpError";

/** Read ABENLA balance under the per-admin ten-per-minute diagnostic quota. */
export async function POST(): Promise<NextResponse> {
  try {
    const adminId = await requireRegistrationOtpAdmin();
    return NextResponse.json({ data: await getRegistrationOtpBalance(adminId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return registrationOtpErrorResponse(error); }
}
