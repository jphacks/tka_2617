import assert from "node:assert/strict";
import { test } from "node:test";
import type { GarmentView } from "@pitari/api";
import { TOPS, trouserTable } from "@/components/try-on/use-try-on";
import {
  fitAt,
  MEASUREMENT_KEYS,
  sizeKeyValues,
  topMeasurements,
} from "@/lib/garment";
import {
  TROUSER_KEYS,
  trouserFitAt,
  trouserKeyValues,
  trouserMeasurements,
} from "@/lib/trousers";

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
): GarmentView {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    name: "撮った服",
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

const longSleeveTop = garmentView("long_sleeve_top", {
  shoulderWidthCm: 46,
  sleeveLengthCm: 61,
  bodyWidthCm: 54,
  bodyLengthCm: 71,
});

void test("上の服は、APIの寸法の4項目が着丈・身幅・肩幅・袖丈になる", () => {
  assert.deepEqual(topMeasurements(longSleeveTop), {
    length: 71,
    width: 54,
    shoulder: 46,
    sleeve: 61,
  });
});

void test("上の服のサイズキーで作り直した寸法が、APIの寸法と一致する（Tシャツ・長袖・シャツ）", () => {
  const target = topMeasurements(longSleeveTop);
  for (const { table } of Object.values(TOPS)) {
    const fit = fitAt("standard", table.standard_cm, table);
    const keys = sizeKeyValues(target, fit, table);
    for (const p of MEASUREMENT_KEYS) {
      const row = fit.m[table.parts.indexOf(p)];
      const made =
        fit.base[p] +
        table.parts.reduce((sum, q, i) => sum + row[i] * keys[`size_${q}`], 0);
      assert.ok(Math.abs(made - target[p]) < 1e-6, `${p}：${String(made)}`);
    }
  }
});

void test("ズボンは、APIの寸法の6項目からサイズキーの値が決まる", () => {
  const trousers = garmentView("trousers", {
    waistCm: 80,
    hipCm: 100,
    thighWidthCm: 31,
    riseCm: 25,
    inseamCm: 78,
    hemWidthCm: 20,
  });
  const target = trouserMeasurements(trousers);
  assert.deepEqual(target, {
    waist: 80,
    hip: 100,
    thigh: 31,
    rise: 25,
    inseam: 78,
    hem: 20,
  });
  const fit = trouserFitAt("standard", trouserTable.standard_cm, trouserTable);
  const keys = trouserKeyValues(target, fit, trouserTable);
  assert.deepEqual(
    Object.keys(keys).sort(),
    TROUSER_KEYS.map((k) => `size_${k}`).sort(),
  );
  for (const value of Object.values(keys)) assert.ok(Number.isFinite(value));
});

void test("寸法が足りない服や、種類の違う服は、キーを決めずに止める", () => {
  assert.throws(() =>
    topMeasurements(garmentView("short_sleeve_top", { bodyWidthCm: 50 })),
  );
  assert.throws(() => topMeasurements(garmentView("trousers", {})));
  assert.throws(() => trouserMeasurements(longSleeveTop));
});
