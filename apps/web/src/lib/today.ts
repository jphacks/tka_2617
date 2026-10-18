import type { Category } from "@pitari/api";

type Part = "tops" | "bottoms";

// 種類を足したときに、トップスかボトムスかを決め忘れると型エラーになる
const categoryParts: Record<Category, Part> = {
  short_sleeve_top: "tops",
  long_sleeve_top: "tops",
  shirt: "tops",
  trousers: "bottoms",
};

const partLabels: Record<Part, string> = {
  tops: "トップス",
  bottoms: "ボトムス",
};

export type WardrobeNeed = { label: string; registered: boolean };

// コーデの提案に要る、トップスとボトムスが1着ずつあるか。
// 靴の種類はまだ無く、アバターは見本の靴を履くので、靴は数えない（ADR 0045）
export function wardrobeNeeds(categories: Category[]): WardrobeNeed[] {
  const registered = new Set(
    categories.map((category) => categoryParts[category]),
  );
  return (["tops", "bottoms"] as const).map((part) => ({
    label: partLabels[part],
    registered: registered.has(part),
  }));
}

// 「10月18日（日）」の形。サーバー（Vercel）はUTCで動くので、日本の日付で出す
export function todayLabel(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}月${parts.day}日（${parts.weekday}）`;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 日本の日付が変わるたびに1つ進む数。コーデの提案を、日ごとに別の組み合わせにする
export function dayNumberOf(date: Date): number {
  return Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS);
}
