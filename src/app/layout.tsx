import type { Metadata, Viewport } from "next";
import localFont from 'next/font/local';
import PwaClient from '@/components/PwaClient';
import "./globals.css";
const inter = localFont({ src: './fonts/Inter-latin.woff2', variable: '--font-inter', weight: '300 900', display: 'swap', fallback: ['Arial', 'sans-serif'] });
export const metadata: Metadata = {
  title: "Buffer — understand your perp exposure",
  description:
    "A clear snapshot of your Solana perpetual positions and the incremental effect of a shared market move.",
  icons: {
    icon: [
      { url: '/favicon.ico?v=tile4', type: 'image/x-icon', sizes: '192x192' },
      { url: '/icons/icon.svg?v=tile4', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/favicon.ico?v=tile4',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Buffer' },
  applicationName: 'Buffer',
};
export const viewport: Viewport = { themeColor: '#315fe8', viewportFit: 'cover' };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}<PwaClient /></body>
    </html>
  );
}
