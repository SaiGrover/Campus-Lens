import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["300","400","500","600","700"] });

export const metadata: Metadata = {
  title: "CampusLens — Campus Friction Intelligence",
  description: "Discover what problems students repeatedly face, where they happen, and the hidden patterns behind them.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "CampusLens", description: "See the friction. Fix the campus.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "CampusLens", description: "See the friction. Fix the campus.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} ${sora.variable}`}>{children}</body></html>;
}
