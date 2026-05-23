import type { Metadata } from "next";
import OrderTrackingPage from "@/src/views/customer/OrderTrackingPage";

export const metadata: Metadata = {
  title: "Theo dõi đơn hàng – Bánh Cá Bốn Mùa",
  description: "Xem trạng thái đơn hàng và thanh toán qua chuyển khoản ngân hàng.",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Customer order tracking entry point. */
export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <OrderTrackingPage orderId={id} />;
}
