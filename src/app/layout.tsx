import type { Metadata, Viewport } from "next";
import PwaClient from '@/components/PwaClient';
import "./globals.css";
export const metadata: Metadata = {
  title: "Buffer — understand your perp exposure",
  description:
    "A clear snapshot of your Drift positions and the incremental effect of a shared market move.",
  icons: { icon: "/icons/icon.svg", apple: '/icons/apple-touch-icon.png' },
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
    <html lang="en">
      <body>{children}<PwaClient /></body>
    </html>
  );
}
