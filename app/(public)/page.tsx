import HomePage from '@/src/views/HomePage';
import { headers } from 'next/headers';
import { serializeJsonLd } from '@/src/utils/jsonLd';

export const metadata = {
  title: 'Bạn Cá Bán Matcha — Tiên phong văn hóa Matcha tại Bình Dương',
  description: 'Thưởng thức vị matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một, Bình Dương. Trải nghiệm matcha ceremonial grade được pha chế thủ công.',
  openGraph: {
    title: 'Bạn Cá Bán Matcha — Tiên phong văn hóa Matcha tại Bình Dương',
    description: 'Thưởng thức vị matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một, Bình Dương. Trải nghiệm matcha ceremonial grade được pha chế thủ công.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Bạn Cá Bán Matcha',
  url: 'https://ban-ca-ban-matcha.vercel.app',
  logo: 'https://ban-ca-ban-matcha.vercel.app/logo.png',
  description: 'Quán matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một, Bình Dương',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Thủ Dầu Một',
    addressRegion: 'Bình Dương',
    addressCountry: 'VN'
  },
  sameAs: [
    'https://www.facebook.com/bancabanmatcha'
  ]
};

/**
 * app/(public)/page.tsx – Entry-only wrapper for the Home route.
 * Following the Pattern Rule: logic and styling are delegated to src/views/HomePage.
 */
export default async function Page() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <HomePage />
    </>
  );
}
