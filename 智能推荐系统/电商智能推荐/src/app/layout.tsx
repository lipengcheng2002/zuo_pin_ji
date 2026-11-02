import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/providers/Toast";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "织言 ZHIYAN — 懂你的 AI 时装衣橱",
    template: "%s · 织言 ZHIYAN",
  },
  description:
    "织言 ZHIYAN 是以面料与剪裁为核心的当代衣橱品牌。AI 造型师基于用户画像、商品特征库与多路召回，为每一次出门找到恰如其分的那一件。",
  keywords: ["织言", "ZHIYAN", "设计师女装", "AI 造型师", "个性化推荐", "羊绒大衣", "真丝衬衫"],
  authors: [{ name: "ZHIYAN Atelier" }],
  openGraph: {
    title: "织言 ZHIYAN — 懂你的 AI 时装衣橱",
    description:
      "以 1,200 万次穿搭行为为经纬，织言 AI 造型师为每一次出门，找到恰如其分的那一件。",
    type: "website",
    locale: "zh_CN",
    siteName: "织言 ZHIYAN",
    url: siteUrl,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "织言 ZHIYAN — 衣橱，应当懂你。",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "织言 ZHIYAN — 懂你的 AI 时装衣橱",
    description: "AI 造型师 × 当代衣橱。秋冬系列现已上线。",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  category: "shopping",
  appleWebApp: {
    capable: true,
    title: "织言",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f1ea",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-ivory text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-ivory"
        >
          跳至主要内容
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
