import HistoryPage from "@/src/views/customer/HistoryPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lịch sử của tôi - Bánh Cá Bốn Mùa",
};

export default function Page() {
  return <HistoryPage />;
}
