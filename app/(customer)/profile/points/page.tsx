import type { Metadata } from "next";
import Points from "@/src/views/Points";

export const metadata: Metadata = {
  title: "Đổi điểm – Bạn Cá Bán Matcha",
  description: "Dùng điểm tích lũy để đổi voucher giảm giá hoặc sản phẩm miễn phí tại Bạn Cá Bán Matcha.",
};

/** Points-exchange page — renders the Points view component. */
export default function PointsPage() {
  return <Points />;
}
