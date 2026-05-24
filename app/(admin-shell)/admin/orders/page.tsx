import AdminOrdersPage from "@/src/views/admin/AdminOrdersPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tất cả đơn hàng | Bạn Cá Bán Matcha",
};

export default function Page() {
  return <AdminOrdersPage />;
}
