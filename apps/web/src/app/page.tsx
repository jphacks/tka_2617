import { ClosetContents } from "@/components/closet-contents";

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

      <ClosetContents />
    </>
  );
}
