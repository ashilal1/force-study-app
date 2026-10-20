import type { Metadata, Viewport } from "next";
import { Archivo_Black } from "next/font/google";
import "./globals.css";

// Latin display face is self-hosted by next/font. Japanese faces load from Google Fonts in the
// browser instead: their CSS is split by unicode-range, so the browser fetches only the glyphs a
// page uses (self-hosting them would download every slice at build time). Rubik Wet Paint (the
// "OR PENALTY" graffiti of the lowest rank's theme) and the look themes' faces (M PLUS Rounded 1c,
// Zen Maru Gothic, Shippori Mincho B1, Creepster) ride along: each is only fetched when shown.
const archivo = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-archivo" });

const JAPANESE_FONTS =
  "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Rubik+Wet+Paint&family=Zen+Kaku+Gothic+New:wght@500;700;900&family=BIZ+UDGothic:wght@700&family=Klee+One:wght@600&family=M+PLUS+Rounded+1c:wght@800&family=Zen+Maru+Gothic:wght@900&family=Shippori+Mincho+B1:wght@800&family=Creepster&display=swap";

export const metadata: Metadata = {
  title: "Commit or Treat",
  description: "友人どうしで学習をサボれなくするアプリ",
  // Home-screen app on iOS (needed for Web Push there).
  appleWebApp: { capable: true, title: "Commit or Treat", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f4efe8",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${archivo.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={JAPANESE_FONTS} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
