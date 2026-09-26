import type { MetadataRoute } from 'next';

import { SITE_URL } from './site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Read endpoints answer per-request account state, and the sign-in page
      // is for one operator, so neither holds anything stable to index.
      disallow: ['/api/', '/auth'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
