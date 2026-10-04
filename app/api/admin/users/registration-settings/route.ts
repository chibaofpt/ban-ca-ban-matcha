import { NextResponse } from "next/server";
import { RegistrationOtpSettingsSchema } from "@/lib/validations/auth";
import { requireRegistrationOtpAdmin } from "@/lib/auth/registrationOtpAdmin";
import { registrationOtpAdminData, updateRegistrationOtpSettings } from "@/lib/auth/registrationOtpSettings";
import { RegistrationOtpError, registrationOtpErrorResponse } from "@/lib/auth/registrationOtpError";

/** Read global registration settings with today's reserved paid-send estimate. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireRegistrationOtpAdmin();
    return NextResponse.json({ data: await registrationOtpAdminData() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return registrationOtpErrorResponse(error); }
}

/** Update the singleton settings with a required optimistic revision guard. */
export async function PUT(req: Request): Promise<NextResponse> {
  try {
    await requireRegistrationOtpAdmin();
    const parsed = RegistrationOtpSettingsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new RegistrationOtpError(400, "VALIDATION_ERROR", "INVALID_INPUT");
    return NextResponse.json({ data: await updateRegistrationOtpSettings(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return registrationOtpErrorResponse(error); }
}
