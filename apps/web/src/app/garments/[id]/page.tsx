import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import { GarmentDetail } from "@/components/garment-detail";

export const metadata: Metadata = {
  title: "服の詳細 | Pitari",
};

export default async function GarmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-white/96 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="relative flex h-11 items-center justify-center">
          <Link
            href="/closet"
            aria-label="クローゼットに戻る"
            className="absolute left-1 flex size-11 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
          >
            <ChevronLeftIcon className="size-6" strokeWidth={1.8} />
          </Link>
          <h1 className="text-base font-semibold">服の詳細</h1>
        </div>
      </header>

      <GarmentDetail id={id} />
    </>
  );
}
