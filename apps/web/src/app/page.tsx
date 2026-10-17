import { TodayContents } from "@/components/today-contents";

export default function TodayPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">今日のコーデ</h1>
        </div>
      </header>

      <TodayContents />
    </>
  );
}
