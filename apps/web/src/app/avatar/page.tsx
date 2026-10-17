import type { Metadata } from "next";
import { AvatarClient } from "@/app/avatar/avatar-client";

export const metadata: Metadata = {
  title: "アバター | Pitari",
};

export default function AvatarPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex h-11 items-center justify-center">
          <h1 className="text-base font-semibold">アバター</h1>
        </div>
      </header>
      <AvatarClient />
    </>
  );
}
