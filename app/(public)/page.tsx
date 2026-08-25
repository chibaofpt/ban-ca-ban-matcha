import MenuPage from '@/src/views/MenuPage';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { serializeJsonLd } from '@/src/utils/jsonLd';

export const metadata = {
  title: 'Menu — Bạn Cá Bán Matcha',
  description: 'Khám phá menu matcha chuẩn Nhật và bánh cá đặc trưng của Bạn Cá Bán Matcha tại Bình Dương.',
  openGraph: {
    title: 'Menu — Bạn Cá Bán Matcha',
    description: 'Khám phá menu matcha chuẩn Nhật và bánh cá đặc trưng của Bạn Cá Bán Matcha tại Bình Dương.',
  },
};

export const dynamic = 'force-dynamic';

/** Render the public menu at the launch default route. */
export default async function Page() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  let serializedJsonLd: string | null = null;
  try {
    const items = await prisma.menuItem.findMany({
      where: { is_available: true },
      include: { sizes: true },
    });

    serializedJsonLd = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Menu',
      name: 'Menu Bạn Cá Bán Matcha',
      hasMenuSection: [{
        '@type': 'MenuSection',
        name: 'Đồ Uống & Món Ăn',
        hasMenuItem: items.map((item) => {
          const prices = item.sizes.map((size) => size.base_price_vnd).filter((price) => price !== null) as number[];
          const basePrice = prices.length > 0 ? Math.min(...prices) : 0;
          return {
            '@type': 'MenuItem',
            name: item.name,
            description: item.description ?? '',
            offers: { '@type': 'Offer', priceCurrency: 'VND', price: basePrice.toString() },
          };
        }),
      }],
    });
  } catch {
    console.error('[page] Failed to generate menu JSON-LD because the database is unavailable');
  }

  return (
    <>
      {serializedJsonLd && <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializedJsonLd }} />}
      <MenuPage />
    </>
  );
}
