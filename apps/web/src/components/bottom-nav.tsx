"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CameraIcon, HangerIcon, PersonIcon } from "@/components/icons";

const items = [
  { href: "/", label: "クローゼット", Icon: HangerIcon },
  { href: "/capture", label: "撮影", Icon: CameraIcon },
  { href: "/avatar", label: "アバター", Icon: PersonIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 mx-auto grid max-w-120 grid-cols-3 border-t border-line bg-white px-2 pt-1 pb-[calc(env(safe-area-inset-bottom)+8px)]"
    >
      {items.map(({ href, label, Icon }) => {
        const isCurrent = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={`flex min-h-13 flex-col items-center justify-center gap-0.75 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main ${isCurrent ? "text-main" : "text-muted"}`}
          >
            <Icon className="size-6" strokeWidth={isCurrent ? 2.2 : 1.6} />
            <span
              className={`text-[10px] ${isCurrent ? "font-bold" : "font-normal"}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
