import MenuPage from '@/src/views/MenuPage';
import { prisma } from '@/lib/prisma';

export const metadata = {
  title: 'Menu — Bạn Cá Bán Matcha',
  description: 'Khám phá menu matcha chuẩn Nhật và bánh cá đặc trưng của Bạn Cá Bán Matcha tại Bình Dương.',
  openGraph: {
    title: 'Menu — Bạn Cá Bán Matcha',
    description: 'Khám phá menu matcha chuẩn Nhật và bánh cá đặc trưng của Bạn Cá Bán Matcha tại Bình Dương.',
  },
};

export const dynamic = 'force-dynamic';

export default async function Page() {
  // Fetch minimal data for SEO JSON-LD on the server
  const items = await prisma.menuItem.findMany({
    where: { is_available: true },
    include: { sizes: true },
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: 'Menu Bạn Cá Bán Matcha',
    hasMenuSection: [
      {
        '@type': 'MenuSection',
        name: 'Đồ Uống & Món Ăn',
        hasMenuItem: items.map(item => {
           // Lấy giá cơ bản thấp nhất có sẵn
           const prices = item.sizes.map(s => s.base_price_vnd).filter(p => p !== null) as number[];
           const basePrice = prices.length > 0 ? Math.min(...prices) : 0;
           
           return {
             '@type': 'MenuItem',
             name: item.name,
             description: item.description ?? '',
             offers: {
               '@type': 'Offer',
               priceCurrency: 'VND',
               price: basePrice.toString()
             }
           };
        })
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MenuPage />
    </>
  );
}
