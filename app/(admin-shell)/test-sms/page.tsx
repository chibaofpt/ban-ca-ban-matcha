import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionFromHeaders } from "@/lib/auth";
import { getSmsTestGateStatus } from "@/lib/smsTestGate";
import SmsTestPage from "@/src/views/admin/SmsTestPage";

export const metadata: Metadata = {
  title: "Thử nghiệm SMS — Quản trị Bạn Cá Bán Matcha",
  robots: { index: false, follow: false },
};

/** Render the preview-only SMS test workspace for an authenticated admin. */
export default async function Page() {
  const gateStatus = getSmsTestGateStatus();
  if (!gateStatus.enabled) {
    console.warn("[sms-test] page blocked by environment gate", {
      route: "/test-sms",
      missing: gateStatus.missing,
      invalid: gateStatus.invalid,
    });
    notFound();
  }

  const session = await getSessionFromHeaders();
  if (!session) redirect("/?auth=login");
  if (session.role !== "ADMIN") notFound();

  return <SmsTestPage />;
}
