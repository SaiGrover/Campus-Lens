import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Sora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["300","400","500","600","700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "CampusLens — Campus Friction Intelligence",
  description: "Discover what problems students repeatedly face, where they happen, and the hidden patterns behind them.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "CampusLens", description: "See the friction. Fix the campus.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "CampusLens", description: "See the friction. Fix the campus.", images: ["/og.png"] },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0e0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} ${inter.variable}`}>{children}</body></html>;
}
