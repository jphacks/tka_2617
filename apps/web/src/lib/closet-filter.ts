import type { Category } from "@pitari/api";
import { categoryLabels } from "@/lib/garment-category";

export type ClosetFilter = Category | "all";

// 服の種類はcategoryLabelsから作るので、種類を足すと選択肢にも出る
export const closetFilters: ClosetFilter[] = [
  "all",
  ...(Object.keys(categoryLabels) as Category[]),
];

export function closetFilterLabel(filter: ClosetFilter): string {
  return filter === "all" ? "すべて" : categoryLabels[filter];
}

// 「すべて」ではcategoryを付けず、APIに全部を返してもらう
export function garmentsPath(filter: ClosetFilter): string {
  return filter === "all"
    ? "/api/garments"
    : `/api/garments?${new URLSearchParams({ category: filter }).toString()}`;
}
