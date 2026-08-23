import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { GoogleMapsProvider } from "./components/GoogleMapsProvider";
import { BRAND_NAME } from "@/lib/brand";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Chicago's Wedding Vendor Marketplace`,
  description:
    "Find trusted Chicago wedding vendors: venues, catering, florals, photography, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://www.instagram.com" />
        <link rel="dns-prefetch" href="https://www.instagram.com" />
      </head>
      <body className={`${dmSans.className} min-h-full flex flex-col`}>
        <GoogleMapsProvider>{children}</GoogleMapsProvider>
      </body>
    </html>
  );
}
