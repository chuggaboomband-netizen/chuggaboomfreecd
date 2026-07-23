import type { Metadata } from "next";

import { PublicMetaPixel } from "./public-meta-pixel";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claim Your Free ChuggaBoom CD!",
  description: "Free CD landing page, upsells, and Shopify checkout mapping."
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PublicMetaPixel />
        {children}
      </body>
    </html>
  );
}
