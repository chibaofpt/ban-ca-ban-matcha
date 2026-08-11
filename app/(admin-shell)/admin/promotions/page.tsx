import type { Metadata } from "next";
import AdminPromotionsPage from "@/src/views/admin/AdminPromotionsPage";

export const metadata: Metadata = {
  title: "Khuyến mãi mua X tặng Y | Bạn Cá Bán Matcha",
};

/** Admin promotion campaign page. */
export default function PromotionsPage() {
  return <AdminPromotionsPage />;
}
