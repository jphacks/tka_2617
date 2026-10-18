import type { Metadata } from "next";
import { WearLogContents } from "@/components/wear-log-contents";

export const metadata: Metadata = {
  title: "記録 | Pitari",
};

export default function LogPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">記録</h1>
        </div>
      </header>

      <WearLogContents />
    </>
  );
}
