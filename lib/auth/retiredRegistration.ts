import { NextResponse } from "next/server";
/** Retire public phone registration without disclosing account existence or sending SMS. */
export function retiredRegistration(): NextResponse {
  return NextResponse.json({ error: "Vui lòng cập nhật ứng dụng để đăng ký bằng Google", code: "BUSINESS_RULE_VIOLATION", details: { reason: "CLIENT_UPDATE_REQUIRED" } }, { status: 410 });
}
