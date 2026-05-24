import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://ban-ca-ban-matcha.vercel.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/staff/',
        '/profile/',
        '/history',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
