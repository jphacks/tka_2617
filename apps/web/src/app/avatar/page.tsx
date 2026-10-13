import type { Metadata } from "next";
import { AvatarViewer } from "@/components/avatar-viewer";

export const metadata: Metadata = {
  title: "アバター | Pitari",
};

// アバターの表示と体型の調整は#15で作る。今はTシャツのモデルだけを表示する
export default function AvatarPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">アバター</h1>
        </div>
      </header>

      <main className="flex flex-col gap-4 px-4 py-5 motion-safe:animate-fade-in">
        <div className="flex flex-col gap-2">
          <span className="self-start rounded border border-main px-2 py-0.75 text-[11px] font-semibold">
            準備中
          </span>
          <p className="text-[13px] leading-[1.7] text-description">
            体型を調整したアバターに、登録した服を着せられます。
          </p>
        </div>

        <AvatarViewer />

        <div className="flex flex-col gap-1.5">
          <h2 className="text-[15px] font-semibold">
            アバター機能は現在準備中です
          </h2>
          <p className="text-[13px] leading-[1.7] text-pretty text-description">
            今はTシャツのモデルだけを表示しています。アバターの表示と体型の調整は、今後のアップデートで使えるようになります。
          </p>
        </div>
      </main>
    </>
  );
}
