import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Buffer — understand your perp exposure",
  description:
    "A clear snapshot of your Drift positions and the incremental effect of a shared market move.",
  icons: { icon: "/brand/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
