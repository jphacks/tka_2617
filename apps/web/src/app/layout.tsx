import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import "@/app/globals.css";

// subsetsは「preloadする文字の範囲」の指定で、日本語の指定が無い。日本語の文字はpreloadせずに読む
// （https://zenn.dev/yhay81/articles/202512-webfont）
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pitari",
  description:
    "部屋の服を撮影してクローゼットに保存し、体型を変えられるアバターに着せるアプリ",
};

// iPhoneのホームバーやノッチの分をenv(safe-area-inset-*)で空けるため
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} antialiased`}>
      <body className="bg-surface font-sans text-main">
        {/* 下の余白は、固定した下部ナビの高さ（線1px＋上4px＋項目52px＋下8px）。本文がナビに隠れないようにする */}
        <div className="mx-auto min-h-dvh max-w-120 bg-white pb-[calc(65px+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
