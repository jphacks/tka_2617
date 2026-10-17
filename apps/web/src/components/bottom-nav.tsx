"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  CalendarIcon,
  HangerIcon,
  PersonIcon,
  PlusIcon,
  SunIcon,
} from "@/components/icons";
import { AddSheet } from "@/components/add-sheet";

const tabs = [
  { href: "/", label: "今日", Icon: SunIcon },
  { href: "/closet", label: "クローゼット", Icon: HangerIcon },
  { href: "/log", label: "記録", Icon: CalendarIcon },
  { href: "/avatar", label: "マイ", Icon: PersonIcon },
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main";

export function BottomNav() {
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);

  const tabLink = ({ href, label, Icon }: (typeof tabs)[number]) => {
    // 服の詳細はクローゼットの中の画面として扱う
    const isCurrent =
      pathname === href ||
      (href === "/closet" && pathname.startsWith("/garments/"));
    return (
      <Link
        key={href}
        href={href}
        aria-current={isCurrent ? "page" : undefined}
        className={`flex min-h-13 flex-col items-center justify-center gap-0.75 transition-colors ${focusRing} ${isCurrent ? "text-main" : "text-muted"}`}
      >
        <Icon className="size-6" strokeWidth={isCurrent ? 2.2 : 1.6} />
        <span
          className={`text-[10px] ${isCurrent ? "font-bold" : "font-normal"}`}
        >
          {label}
        </span>
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="メインナビゲーション"
        className="fixed inset-x-0 bottom-0 mx-auto grid max-w-120 grid-cols-5 border-t border-line bg-white px-2 pt-1 pb-[calc(env(safe-area-inset-bottom)+8px)]"
      >
        {tabs.slice(0, 2).map(tabLink)}
        {/* 服の追加（撮影・ZOZO）は、真ん中の＋1か所にまとめる */}
        <button
          type="button"
          aria-label="服を追加する"
          aria-haspopup="dialog"
          onClick={() => sheet.current?.showModal()}
          className={`flex min-h-13 items-center justify-center rounded ${focusRing}`}
        >
          <span className="flex size-11.5 items-center justify-center rounded-full bg-main text-white transition active:scale-95">
            <PlusIcon className="size-5.5" strokeWidth={2} />
          </span>
        </button>
        {tabs.slice(2).map(tabLink)}
      </nav>
      <AddSheet ref={sheet} />
    </>
  );
}
