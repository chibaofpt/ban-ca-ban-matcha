import { NextResponse } from "next/server";
/** Retire password acceptance while keeping the endpoint available to older clients. */
export async function POST(_request: Request) {
  void _request;
  return NextResponse.json({ error: "Vui lòng liên kết Google để nhận tài khoản", code: "BUSINESS_RULE_VIOLATION", details: { reason: "GOOGLE_CLAIM_REQUIRED" } }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
