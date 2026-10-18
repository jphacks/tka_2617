import assert from "node:assert/strict";
import { test } from "node:test";
import type { ColorFamily, Season } from "@pitari/api";
import {
  suggestOutfit,
  type SuggestionGarment,
  type TodayConditions,
} from "@/lib/outfit-suggestion";

function garment(
  id: string,
  category: SuggestionGarment["category"],
  {
    seasons = [],
    material = "cotton",
    colorFamily = "white",
  }: {
    seasons?: Season[];
    material?: string;
    colorFamily?: ColorFamily | null;
  } = {},
): SuggestionGarment {
  return {
    id,
    category,
    seasons,
    materials: [{ materialId: material, label: material, percent: 100 }],
    colorFamily,
  };
}

const day = (
  temperatures: TodayConditions["temperatures"],
  season: Season | null = "autumn",
  dayNumber = 0,
): TodayConditions => ({ season, temperatures, dayNumber });
const at = (morning: number, noon: number, night: number) => ({
  morning,
  noon,
  night,
});

const ids = (suggestion: ReturnType<typeof suggestOutfit>) =>
  "missing" in suggestion
    ? suggestion.missing
    : [suggestion.top.id, suggestion.bottom.id];

const tshirt = garment("t", "short_sleeve_top");
const longSleeve = garment("l", "long_sleeve_top");
const jeans = garment("j", "trousers", { colorFamily: "blue" });

void test("いちばん暖かい時刻が25°C以上なら半袖、それより下なら長そでかシャツを選ぶ", () => {
  const closet = [tshirt, longSleeve, jeans];
  const hot = suggestOutfit(closet, day(at(20, 25, 22)));
  assert.deepEqual(ids(hot), ["t", "j"]);
  assert.ok(!("missing" in hot));
  assert.equal(hot.reason, "25°Cまで上がるので、半袖にしました");

  assert.deepEqual(ids(suggestOutfit(closet, day(at(18, 24, 20)))), ["l", "j"]);
  const shirt = garment("s", "shirt");
  assert.deepEqual(ids(suggestOutfit([shirt, jeans], day(at(18, 24, 20)))), [
    "s",
    "j",
  ]);
});

void test("気温に合う袖の服が無ければ、足りない服を文で出す", () => {
  assert.equal(
    ids(suggestOutfit([tshirt, jeans], day(at(15, 22, 18)))),
    "長そでのトップスかシャツがあると、合わせやすいです",
  );
  assert.equal(
    ids(suggestOutfit([longSleeve, jeans], day(at(24, 30, 27)))),
    "半袖のトップスがあると、暑い日に合わせやすいです",
  );
});

void test("気温が分からなければ、袖の長さを問わずに選ぶ", () => {
  const suggestion = suggestOutfit([longSleeve, jeans], day(null));
  assert.deepEqual(ids(suggestion), ["l", "j"]);
  assert.ok(!("missing" in suggestion));
  assert.equal(
    suggestion.reason,
    "気温が分からないので、袖の長さを問わずに選びました",
  );
  // 3つとも取れなかったときも同じ
  assert.deepEqual(
    ids(
      suggestOutfit(
        [longSleeve, jeans],
        day({ morning: null, noon: null, night: null }),
      ),
    ),
    ["l", "j"],
  );
});

void test("服に付けた季節が今日の季節でなければ選ばない。季節を付けていない服はいつでも選ぶ", () => {
  const winterOnly = garment("a", "long_sleeve_top", { seasons: ["winter"] });
  const autumn = garment("b", "long_sleeve_top", {
    seasons: ["autumn", "winter"],
  });
  assert.deepEqual(
    ids(suggestOutfit([winterOnly, autumn, jeans], day(at(12, 18, 14)))),
    ["b", "j"],
  );
  assert.deepEqual(
    ids(suggestOutfit([winterOnly, longSleeve, jeans], day(at(12, 18, 14)))),
    ["l", "j"],
  );
  // 天気を読めず季節も分からないときは、季節では絞らない
  assert.deepEqual(ids(suggestOutfit([winterOnly, jeans], day(null, null))), [
    "a",
    "j",
  ]);
});

void test("夏はウール・カシミヤ・アクリル、冬は麻がいちばん多い服を選ばない", () => {
  const wool = garment("a", "short_sleeve_top", { material: "wool" });
  assert.deepEqual(
    ids(suggestOutfit([wool, tshirt, jeans], day(at(26, 31, 28), "summer"))),
    ["t", "j"],
  );
  const linen = garment("a", "long_sleeve_top", { material: "linen" });
  assert.deepEqual(
    ids(suggestOutfit([linen, longSleeve, jeans], day(at(3, 9, 5), "winter"))),
    ["l", "j"],
  );
  const linenTrousers = garment("p", "trousers", { material: "linen" });
  assert.equal(
    ids(suggestOutfit([longSleeve, linenTrousers], day(at(3, 9, 5), "winter"))),
    "今の季節に合うズボンがあると、合わせやすいです",
  );
  // 割合の少ない素材では外さない
  const mixed: SuggestionGarment = {
    ...tshirt,
    id: "m",
    materials: [
      { materialId: "cotton", label: "綿", percent: 80 },
      { materialId: "wool", label: "ウール", percent: 20 },
    ],
  };
  assert.deepEqual(
    ids(suggestOutfit([mixed, jeans], day(at(26, 31, 28), "summer"))),
    ["m", "j"],
  );
});

void test("どちらかが白・黒・グレー・紺・ベージュの組み合わせを、どちらも色みの強い組み合わせより先に選ぶ", () => {
  const red = garment("a", "long_sleeve_top", { colorFamily: "red" });
  const navy = garment("b", "long_sleeve_top", { colorFamily: "navy" });
  const green = garment("p", "trousers", { colorFamily: "green" });
  assert.deepEqual(
    ids(suggestOutfit([red, navy, green], day(at(12, 18, 14)))),
    ["b", "p"],
  );
  // ジーンズの青は何とでも合わせやすいので、赤とも組む
  for (const dayNumber of [0, 1]) {
    assert.deepEqual(
      ids(
        suggestOutfit([red, jeans], day(at(12, 18, 14), "autumn", dayNumber)),
      ),
      ["a", "j"],
    );
  }
  // 色が分からない服は、色みの強い組み合わせよりは先、合わせやすい組み合わせよりは後
  const unknown = garment("c", "long_sleeve_top", { colorFamily: null });
  assert.deepEqual(
    ids(suggestOutfit([red, unknown, green], day(at(12, 18, 14)))),
    ["c", "p"],
  );
  assert.deepEqual(
    ids(suggestOutfit([navy, unknown, green], day(at(12, 18, 14)))),
    ["b", "p"],
  );
});

void test("同じ日は同じ組み合わせ、次の日は下を同じにして上を替える", () => {
  const closet = [
    garment("a", "long_sleeve_top"),
    garment("b", "shirt"),
    garment("p", "trousers"),
    garment("q", "trousers"),
  ];
  const on = (dayNumber: number) =>
    ids(suggestOutfit(closet, day(at(12, 18, 14), "autumn", dayNumber)));
  assert.deepEqual(on(20000), on(20000));
  assert.deepEqual(
    [on(20000), on(20001), on(20002), on(20003), on(20004)],
    [
      ["a", "p"],
      ["b", "p"],
      ["a", "q"],
      ["b", "q"],
      ["a", "p"],
    ],
  );
});

void test("朝か夜が15°Cを下回れば、上着を足すように添える", () => {
  const cold = suggestOutfit([longSleeve, jeans], day(at(14, 20, 16)));
  assert.ok(!("missing" in cold));
  assert.equal(cold.note, "朝や夜は冷えるので、上着を足すと安心です");
  const mild = suggestOutfit([longSleeve, jeans], day(at(15, 20, 16)));
  assert.ok(!("missing" in mild));
  assert.equal(mild.note, null);
});
