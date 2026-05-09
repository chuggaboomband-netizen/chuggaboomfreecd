import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ChuggaBoom Free CD Funnel",
  description: "Free CD landing page, upsells, and Shopify checkout mapping."
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
