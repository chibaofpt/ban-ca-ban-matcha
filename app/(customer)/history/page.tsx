import { Suspense } from "react";
import type { Metadata } from "next";
import HistoryPage from "@/src/views/customer/HistoryPage";

export const metadata: Metadata = {
  title: "Lịch sử - Bạn Cá Bán Matcha",
  description: "Xem lịch sử đơn hàng và biến động điểm Cá của bạn.",
};

/** Customer history route entry with a search-params suspense boundary. */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main
          className="mx-auto min-h-64 w-full max-w-6xl animate-pulse px-4 py-6 touch-pan-y overflow-x-clip overscroll-x-none"
          aria-busy="true"
          aria-label="Đang tải lịch sử"
        >
          <div className="h-12 rounded-xl bg-muted" />
          <div className="mt-5 h-64 rounded-2xl bg-muted" />
        </main>
      }
    >
      <HistoryPage />
    </Suspense>
  );
}
