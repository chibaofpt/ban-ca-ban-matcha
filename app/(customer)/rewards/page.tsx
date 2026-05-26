import type { Metadata } from "next";
import RewardsPage from "@/src/views/customer/RewardsPage";

export const metadata: Metadata = {
  title: "Quầy Đổi Thưởng — Bạn Cá Bán Matcha",
  description:
    "Dùng điểm tích lũy 🐟 để đổi voucher giảm giá, sản phẩm miễn phí và topping đặc biệt tại Bạn Cá Bán Matcha.",
};

export default function Page() {
  return <RewardsPage />;
}
