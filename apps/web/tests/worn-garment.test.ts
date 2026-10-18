import assert from "node:assert/strict";
import { test } from "node:test";
import type { GarmentView } from "@pitari/api";
import { wornTop, wornTrousers } from "@/lib/worn-garment";

const noMeasurements = {
  shoulderWidthCm: null,
  sleeveLengthCm: null,
  bodyWidthCm: null,
  bodyLengthCm: null,
  waistCm: null,
  hipCm: null,
  thighWidthCm: null,
  riseCm: null,
  inseamCm: null,
  hemWidthCm: null,
};

/** GET /api/garments/:id が返す形の服 */
function garmentView(
  category: GarmentView["category"],
  measurements: Partial<GarmentView["measurements"]>,
  name = "撮った服",
): GarmentView {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    name,
    category,
    measurements: { ...noMeasurements, ...measurements },
    measurementVersion: "df2-a4-flat-midpoint-v2",
    purchasedMonth: null,
    seasons: [],
    colorFamily: null,
    materials: [{ materialId: "cotton", label: "綿", percent: 100 }],
    createdAt: "2026-10-17T00:00:00.000Z",
    images: [],
  };
}

const topSizes = {
  shoulderWidthCm: 46,
  sleeveLengthCm: 61.5,
  bodyWidthCm: 54,
  bodyLengthCm: 71,
};

const trouserSizes = {
  waistCm: 80,
  hipCm: 100,
  thighWidthCm: 31,
  riseCm: 25,
  inseamCm: 78,
  hemWidthCm: 20,
};

void test("上の服は、種類の3Dモデルと寸法で着せる", () => {
  assert.deepEqual(wornTop(garmentView("long_sleeve_top", topSizes)), {
    worn: {
      name: "「撮った服」",
      model: "longsleeve",
      measurements: { length: 71, width: 54, shoulder: 46, sleeve: 61.5 },
    },
  });
  const shirt = wornTop(garmentView("shirt", topSizes));
  assert.ok("worn" in shirt && shirt.worn.model === "shirt");
});

void test("ズボンは、6項目の寸法で着せる", () => {
  assert.deepEqual(wornTrousers(garmentView("trousers", trouserSizes)), {
    worn: {
      name: "「撮った服」",
      measurements: {
        waist: 80,
        hip: 100,
        thigh: 31,
        rise: 25,
        inseam: 78,
        hem: 20,
      },
    },
  });
});

void test("寸法が1つでも足りない服は、着せずに理由を返す", () => {
  assert.deepEqual(
    wornTop(
      garmentView("short_sleeve_top", { ...topSizes, sleeveLengthCm: null }),
    ),
    { problem: "「撮った服」は寸法が足りないため、着せられません" },
  );
  assert.deepEqual(
    wornTrousers(garmentView("trousers", { ...trouserSizes, hipCm: null })),
    { problem: "「撮った服」は寸法が足りないため、着せられません" },
  );
});

void test("上と下を取り違えた服は、着せずに理由を返す", () => {
  assert.deepEqual(wornTop(garmentView("trousers", trouserSizes)), {
    problem: "「撮った服」は上の服ではありません",
  });
  assert.deepEqual(wornTrousers(garmentView("shirt", topSizes)), {
    problem: "「撮った服」は下の服ではありません",
  });
});

void test("名前が無い服は、種類の名前で呼ぶ", () => {
  assert.deepEqual(wornTrousers(garmentView("shirt", topSizes, "")), {
    problem: "「シャツ」は下の服ではありません",
  });
});
