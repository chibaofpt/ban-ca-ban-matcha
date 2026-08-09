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

/** Render the public menu and nonce-authorized SEO metadata. */
export default async function Page() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Best-effort: generate JSON-LD for SEO. If DB is temporarily unreachable,
  // skip the structured data and still render the interactive menu.
  let serializedJsonLd: string | null = null;
  try {
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
            const prices = item.sizes.map(s => s.base_price_vnd).filter(p => p !== null) as number[];
            const basePrice = prices.length > 0 ? Math.min(...prices) : 0;
            return {
              '@type': 'MenuItem',
              name: item.name,
              description: item.description ?? '',
              offers: {
                '@type': 'Offer',
                priceCurrency: 'VND',
                price: basePrice.toString(),
              },
            };
          }),
        },
      ],
    };

    serializedJsonLd = serializeJsonLd(jsonLd);
  } catch {
    // DB unreachable — page still renders, just without JSON-LD structured data.
    console.error('[menu/page] Failed to generate JSON-LD because the database is unavailable');
  }

  return (
    <>
      {serializedJsonLd && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      )}
      <MenuPage />
    </>
  );
}
