import Link from "next/link";
import { CameraIcon, HangerIcon } from "@/components/icons";

// 服の一覧は#14で作る。今は登録された服が無い前提で、空の状態だけを出す
export default function ClosetPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-[15px] font-semibold tracking-[0.24em]">
            <span aria-hidden="true">PITARI</span>
            <span className="sr-only">クローゼット</span>
          </h1>
        </div>
      </header>

      <main className="motion-safe:animate-fade-in">
        <div className="flex items-baseline justify-between px-4 pt-3 text-xs">
          <span className="text-sub">すべて</span>
          <span className="font-semibold">0件</span>
        </div>

        <section className="flex flex-col items-center gap-3.5 px-6 pt-10 pb-9 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-surface">
            <HangerIcon className="size-7" strokeWidth={1.6} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-semibold text-pretty">
              まだ服が登録されていません
            </h2>
            <p className="text-[13px] leading-[1.7] text-pretty text-description">
              服を撮影して、クローゼットに追加しましょう。
            </p>
          </div>
          <Link
            href="/capture"
            className="mt-1.5 flex h-12 w-full max-w-70 items-center justify-center gap-2 rounded bg-main text-sm font-semibold text-white transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main active:scale-[0.98]"
          >
            <CameraIcon className="size-4.5" strokeWidth={1.8} />
            服を登録する
          </Link>
        </section>
      </main>
    </>
  );
}
