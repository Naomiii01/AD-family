import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "My零用錢",
  description: "全家一起學習零用金規劃：自由罐、夢想罐、長期罐。",
  applicationName: "My零用錢",
  appleWebApp: { capable: true, title: "My零用錢", statusBarStyle: "default" },
  icons: { icon: "/icon-192-v2.png", apple: "/apple-touch-icon-v2.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111816" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" data-look="korean">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@500;700;800&family=Noto+Sans+TC:wght@400;500;700;900&family=Huninn&family=LXGW+WenKai+TC:wght@400;700&family=IBM+Plex+Mono:wght@500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
