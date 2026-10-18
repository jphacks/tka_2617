import type { Category, ColorFamily, GarmentView, Season } from "@pitari/api";
import type { DayPart } from "@/lib/weather";

// 選び方と境目はADR 0045
const SHORT_SLEEVE_FROM = 25;
const OUTERWEAR_BELOW = 15;

/** 提案に使う服の項目 */
export type SuggestionGarment = Pick<
  GarmentView,
  "id" | "category" | "seasons" | "materials" | "colorFamily"
>;

export type TodayConditions = {
  /** 天気を読めなかったときはnull。季節では絞らない */
  season: Season | null;
  temperatures: Record<DayPart, number | null> | null;
  /** 日本の日付で1日ごとに1つ進む、0以上の数（`dayNumberOf`）。同じ日は同じ組み合わせにする */
  dayNumber: number;
};

export type OutfitSuggestion<T> =
  | { top: T; bottom: T; reason: string; note: string | null }
  | { missing: string };

const longSleeves: Category[] = ["long_sleeve_top", "shirt"];
const warmMaterials = new Set(["wool", "cashmere", "acrylic"]);
const coolMaterials = new Set(["linen"]);
const easyColors = new Set<ColorFamily>([
  "white",
  "black",
  "gray",
  "navy",
  "beige",
]);

/** クローゼットの服から、今日の上と下を1着ずつ選ぶ。合う服が無ければ、足りない服を文で返す */
export function suggestOutfit<T extends SuggestionGarment>(
  garments: T[],
  { season, temperatures, dayNumber }: TodayConditions,
): OutfitSuggestion<T> {
  const known = Object.values(temperatures ?? {}).filter(
    (value) => value !== null,
  );
  const warmest = known.length > 0 ? Math.max(...known) : null;
  const coldest = known.length > 0 ? Math.min(...known) : null;
  const topCategories: Category[] =
    warmest === null
      ? ["short_sleeve_top", ...longSleeves]
      : warmest >= SHORT_SLEEVE_FROM
        ? ["short_sleeve_top"]
        : longSleeves;

  const tops = garments
    .filter((garment) => topCategories.includes(garment.category))
    .filter((garment) => suitsSeason(garment, season))
    .sort(byId);
  const bottoms = garments
    .filter((garment) => garment.category === "trousers")
    .filter((garment) => suitsSeason(garment, season))
    .sort(byId);
  if (tops.length === 0) return { missing: missingTop(warmest) };
  if (bottoms.length === 0)
    return { missing: "今の季節に合うズボンがあると、合わせやすいです" };

  // 下を同じにして上を替えていく順に並べ、日ごとに次の組み合わせにする
  const pairs = bottoms.flatMap((bottom) =>
    tops.map((top) => ({ top, bottom, rank: colorRank(top, bottom) })),
  );
  const bestRank = Math.min(...pairs.map((pair) => pair.rank));
  const candidates = pairs.filter((pair) => pair.rank === bestRank);
  const { top, bottom } = candidates[dayNumber % candidates.length];
  return {
    top,
    bottom,
    reason: reasonOf(warmest),
    note:
      coldest !== null && coldest < OUTERWEAR_BELOW
        ? "朝や夜は冷えるので、上着を足すと安心です"
        : null,
  };
}

// 服に季節を付けていなければ、どの季節にも着る。素材は、いちばん割合の多いもので見る
function suitsSeason(garment: SuggestionGarment, season: Season | null) {
  if (season === null) return true;
  if (garment.seasons.length > 0 && !garment.seasons.includes(season))
    return false;
  const main = garment.materials.at(0)?.materialId;
  if (main === undefined) return true;
  if (season === "summer") return !warmMaterials.has(main);
  if (season === "winter") return !coolMaterials.has(main);
  return true;
}

// 0：どちらかが何とでも合う色、1：色が分からない服がある、2：どちらも色みが強い
function colorRank(top: SuggestionGarment, bottom: SuggestionGarment) {
  if (top.colorFamily === null || bottom.colorFamily === null) return 1;
  // ジーンズの青も、何とでも合わせやすい
  const easyBottom =
    easyColors.has(bottom.colorFamily) || bottom.colorFamily === "blue";
  return easyColors.has(top.colorFamily) || easyBottom ? 0 : 2;
}

function byId(a: SuggestionGarment, b: SuggestionGarment) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function reasonOf(warmest: number | null): string {
  if (warmest === null)
    return "気温が分からないので、袖の長さを問わずに選びました";
  return warmest >= SHORT_SLEEVE_FROM
    ? `${String(warmest)}°Cまで上がるので、半袖にしました`
    : `${String(warmest)}°Cまでなので、長そでにしました`;
}

function missingTop(warmest: number | null): string {
  if (warmest === null)
    return "今の季節に合うトップスがあると、合わせやすいです";
  return warmest >= SHORT_SLEEVE_FROM
    ? "半袖のトップスがあると、暑い日に合わせやすいです"
    : "長そでのトップスかシャツがあると、合わせやすいです";
}
