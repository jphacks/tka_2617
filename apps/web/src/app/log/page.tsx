import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "記録 | Pitari",
};

// 着た服の記録は#114で作る。それまではメニューから行ける場所だけ置く
export default function LogPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">記録</h1>
        </div>
      </header>

      <main className="px-6 py-10 text-center">
        <p className="text-base font-bold">準備中</p>
        <p className="mt-2 text-sm leading-[1.8] text-description">
          着た服を日ごとに記録して、あとから見返せるようにします。
        </p>
      </main>
    </>
  );
}
