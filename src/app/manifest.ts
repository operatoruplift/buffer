import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Buffer — Understand your exposure',
    short_name: 'Buffer',
    description: 'Read your Solana perpetual positions, explore price scenarios, and understand what moves your exposure.',
    lang: 'en',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f8fa',
    theme_color: '#315fe8',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Open your workspace', short_name: 'Workspace', url: '/app', description: 'Explore accounts and price scenarios' },
      { name: 'Try the offline sample', short_name: 'Sample', url: '/offline.html', description: 'Explore a deterministic sample without an account' },
    ],
  };
}
