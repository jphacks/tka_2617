import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "撮影 | Pitari",
};

// 撮影と登録は#13で作る。今は準備中であることだけを出す
export default function CapturePage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">撮影</h1>
        </div>
      </header>

      <main className="flex flex-col gap-4 px-4 py-5 motion-safe:animate-fade-in">
        <div className="flex flex-col gap-2">
          <span className="self-start rounded border border-main px-2 py-0.75 text-[11px] font-semibold">
            準備中
          </span>
          <p className="text-[13px] leading-[1.7] text-description">
            服を撮影して、クローゼットに登録します。
          </p>
        </div>

        <div className="relative flex aspect-3/4 w-full items-center justify-center rounded bg-surface">
          <span className="absolute top-4 left-4 size-6 border-t-2 border-l-2 border-frame-mark" />
          <span className="absolute top-4 right-4 size-6 border-t-2 border-r-2 border-frame-mark" />
          <span className="absolute bottom-4 left-4 size-6 border-b-2 border-l-2 border-frame-mark" />
          <span className="absolute right-4 bottom-4 size-6 border-r-2 border-b-2 border-frame-mark" />
          <span className="text-xs text-muted">カメラのプレビュー領域</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="text-[15px] font-semibold">
            撮影機能は現在準備中です
          </h2>
          <p className="text-[13px] leading-[1.7] text-pretty text-description">
            カメラでの撮影と服の登録は、今後のアップデートで使えるようになります。
          </p>
        </div>
      </main>
    </>
  );
}
