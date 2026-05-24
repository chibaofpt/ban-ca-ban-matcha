import HomePage from '@/src/views/HomePage';

export const metadata = {
  title: 'Bạn Cá Bán Matcha — Tiên phong văn hóa Matcha tại Bình Dương',
  description: 'Thưởng thức vị matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một, Bình Dương. Trải nghiệm matcha ceremonial grade được pha chế thủ công.',
};

/**
 * app/(public)/page.tsx – Entry-only wrapper for the Home route.
 * Following the Pattern Rule: logic and styling are delegated to src/views/HomePage.
 */
export default function Page() {
  return <HomePage />;
}
