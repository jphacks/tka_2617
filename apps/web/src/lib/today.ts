import type { Category } from "@pitari/api";

type Part = "tops" | "bottoms" | "shoes";

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
  shoes: "靴",
};

export type WardrobeNeed = { label: string; registered: boolean };

// コーデの提案に要る、トップス・ボトムス・靴が1着ずつあるか。靴の種類はまだ無いので、靴はいつも未登録
export function wardrobeNeeds(categories: Category[]): WardrobeNeed[] {
  const registered = new Set(
    categories.map((category) => categoryParts[category]),
  );
  return (["tops", "bottoms", "shoes"] as const).map((part) => ({
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
