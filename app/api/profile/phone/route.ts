import { NextResponse } from "next/server";
import { PhoneUpdateSchema } from "@/lib/validations/account";
import { updateAccountPhone } from "@/lib/auth/accountPhone";
import { accountErrorResponse } from "@/lib/auth/accountError";
import { accountCustomerSession, accountMutationLimit } from "@/lib/auth/accountHttp";

/** Apply the authenticated contact-phone operation with its own ownership proof. */
export async function PATCH(request: Request) {
  try {
    const session = await accountCustomerSession();
    const parsed = PhoneUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", code: "VALIDATION_ERROR" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const limited = await accountMutationLimit(request);
    if (limited) return limited;
    return NextResponse.json({ data: await updateAccountPhone(session, parsed.data.phone_number) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) { return accountErrorResponse(error); }
}
