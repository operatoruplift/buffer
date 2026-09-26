import type { MetadataRoute } from 'next';

import { SITE_URL } from './site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/app`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/demo`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/brand-kit`, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
