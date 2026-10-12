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
    template: "%s | AI CMS Assistant",
    default: "AI CMS Assistant",
  },
  description:
    "Generate pages from a brief, score SEO, write image alt text, and draft FAQs with schema markup — backed by Sanity or WordPress.",
  // This is a portfolio demo with a published, shared login (see README's
  // "Run the demo") — meant to be opened from a direct link, not discovered
  // via search. Left un-indexed on purpose, not an oversight (left-over
  // placeholder metadata was the oversight this whole block replaces).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
