import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: '%s | IronXpress Admin',
    default: 'IronXpress Admin Dashboard',
  },
  description: "IronXpress Admin Dashboard - Manage orders, products, and customers",
  keywords: ['ironxpress', 'admin', 'dashboard', 'orders', 'management'],
  authors: [{ name: 'IronXpress Team' }],
  creator: 'IronXpress',
  publisher: 'IronXpress',
  robots: 'noindex, nofollow', // Keep admin private from search engines
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
