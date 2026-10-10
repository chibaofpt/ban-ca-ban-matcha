import type { Metadata } from "next";
import AccountClaimPage from "@/src/views/customer/AccountClaimPage";

export const metadata: Metadata = {
  title: "Nhận tài khoản | Bạn Cá Bán Matcha",
  robots: { index: false, follow: false },
};

/** Render the private account claim flow without exposing account identity. */
export default function Page() {
  return <AccountClaimPage />;
}