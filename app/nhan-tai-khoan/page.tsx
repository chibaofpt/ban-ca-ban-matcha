import type { Metadata } from "next";
import AccountClaimPage from "@/src/views/customer/AccountClaimPage";

// CSP uses a per-request nonce in middleware; this flow must not be prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nhận tài khoản | Bạn Cá Bán Matcha",
  robots: { index: false, follow: false },
};

/** Render the private account claim flow without exposing account identity. */
export default function Page() {
  return <AccountClaimPage />;
}
