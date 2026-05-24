import MenuPage from '@/src/views/MenuPage';

export const metadata = {
  title: 'Menu — Bạn Cá Bán Matcha',
  description: 'Khám phá menu matcha chuẩn Nhật và bánh cá đặc trưng của Bạn Cá Bán Matcha tại Bình Dương.',
  openGraph: {
    title: 'Menu — Bạn Cá Bán Matcha',
    description: 'Khám phá menu matcha chuẩn Nhật và bánh cá đặc trưng của Bạn Cá Bán Matcha tại Bình Dương.',
  },
};

/**
 * app/(public)/menu/page.tsx – Entry-only wrapper for the Menu route.
 * Following the Pattern Rule: logic and styling are delegated to src/views/MenuPage.
 */
export default function Page() {
  return <MenuPage />;
}
