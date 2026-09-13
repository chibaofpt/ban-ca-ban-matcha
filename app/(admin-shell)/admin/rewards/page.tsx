import type { Metadata } from "next";
import { AdminRewardsPage } from "@/src/components/admin/rewards/AdminRewardsPage";

export const metadata: Metadata = {
  title: "Quà chào mừng — Quản trị Bạn Cá Bán Matcha",
  description: "Thiết lập quà đăng ký và campaign hộp matcha.",
};

export default function Page() {
  return <AdminRewardsPage />;
}
