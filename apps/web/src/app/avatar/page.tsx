import type { Metadata } from "next";
import { Suspense } from "react";
import { AvatarClient } from "@/app/avatar/avatar-client";
import { AvatarFrame } from "@/components/avatar-frame";

export const metadata: Metadata = {
  title: "マイ | Pitari",
};

export default function AvatarPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">マイ</h1>
        </div>
      </header>
      {/* 着せる服をURLのクエリから読むため、その部分はブラウザで描く */}
      <Suspense
        fallback={
          <main className="px-4 py-5">
            <AvatarFrame loading />
          </main>
        }
      >
        <AvatarClient />
      </Suspense>
    </>
  );
}
