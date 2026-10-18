import assert from "node:assert/strict";
import { test } from "node:test";
import type { Category, ColorFamily, GarmentView } from "@pitari/api";
import {
  colorFamilyOf,
  dominantColorFamily,
  similarGarments,
  similarLabel,
} from "@/lib/color-family";

// 写真に写った服の色に近い値で、系統の分け方を確かめる
const samples: [ColorFamily, [number, number, number][]][] = [
  // 電球の光で黄みがかった白・クリーム色も白
  [
    "white",
    [
      [245, 245, 245],
      [220, 222, 228],
      [235, 220, 195],
    ],
  ],
  [
    "black",
    [
      [20, 20, 20],
      [40, 40, 45],
      [30, 35, 45],
    ],
  ],
  [
    "gray",
    [
      [128, 128, 128],
      [90, 90, 92],
      [170, 168, 165],
    ],
  ],
  // 暗い紺も、青みがあれば黒にせず紺にする
  [
    "navy",
    [
      [20, 25, 45],
      [30, 40, 80],
      [40, 60, 95],
    ],
  ],
  [
    "beige",
    [
      [225, 200, 160],
      [195, 176, 145],
      [193, 154, 107],
    ],
  ],
  [
    "brown",
    [
      [101, 67, 33],
      [139, 90, 43],
    ],
  ],
  [
    "red",
    [
      [200, 30, 40],
      [110, 20, 40],
    ],
  ],
  [
    "pink",
    [
      [255, 192, 203],
      [255, 105, 180],
    ],
  ],
  [
    "orange",
    [
      [240, 130, 40],
      [183, 65, 14],
    ],
  ],
  [
    "yellow",
    [
      [200, 170, 40],
      [250, 240, 100],
    ],
  ],
  // カーキ・オリーブも緑
  [
    "green",
    [
      [40, 140, 70],
      [170, 230, 200],
      [120, 115, 70],
    ],
  ],
  [
    "blue",
    [
      [70, 100, 140],
      [170, 195, 225],
      [30, 90, 200],
    ],
  ],
  [
    "purple",
    [
      [120, 60, 160],
      [142, 69, 133],
    ],
  ],
];

void test("服の色を、13の系統に分ける", () => {
  for (const [family, colors] of samples)
    for (const [r, g, b] of colors)
      assert.equal(colorFamilyOf(r, g, b), family, `rgb(${[r, g, b].join()})`);
});

const pixels = (...colors: [number, number, number, number][]) =>
  new Uint8ClampedArray(colors.flat());

void test("透けていない画素でいちばん多い系統にし、背景の透けた画素は数えない", () => {
  const navy: [number, number, number, number] = [30, 40, 80, 255];
  const shadow: [number, number, number, number] = [15, 15, 18, 255];
  const background: [number, number, number, number] = [255, 255, 255, 0];
  assert.equal(
    dominantColorFamily(
      pixels(navy, navy, shadow, background, background, background),
    ),
    "navy",
  );
});

void test("透けていない画素が無ければ、色を決めない", () => {
  assert.equal(dominantColorFamily(pixels([255, 0, 0, 0])), null);
  assert.equal(dominantColorFamily(new Uint8ClampedArray()), null);
});

const garment = (
  id: string,
  category: Category,
  colorFamily: ColorFamily | null,
) => ({ id, category, colorFamily }) as GarmentView;

const closet = [
  garment("added", "short_sleeve_top", "navy"),
  garment("navy-shirt", "shirt", "navy"),
  garment("navy-long", "long_sleeve_top", "navy"),
  garment("white-tee", "short_sleeve_top", "white"),
  garment("unknown-tee", "short_sleeve_top", null),
  garment("navy-trousers", "trousers", "navy"),
];

void test("上下と色の系統が同じ服を数え、足した服は数えない", () => {
  const added = {
    id: "added",
    category: "short_sleeve_top",
    colorFamily: "navy",
  } as const;
  assert.deepEqual(
    similarGarments(closet, added).map((item) => item.id),
    ["navy-shirt", "navy-long"],
  );
  assert.equal(similarLabel(added), "紺のトップス");
  assert.deepEqual(
    similarGarments(closet, {
      id: "new",
      category: "trousers",
      colorFamily: "navy",
    }).map((item) => item.id),
    ["navy-trousers"],
  );
});

void test("足した服の色が分からなければ、上下だけで比べる", () => {
  const added = { id: "new", category: "shirt", colorFamily: null } as const;
  assert.equal(similarGarments(closet, added).length, 5);
  assert.equal(similarLabel(added), "トップス");
});
