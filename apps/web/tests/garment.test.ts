import assert from "node:assert/strict";
import { test } from "node:test";
import longsleeveHeightJson from "@/../public/models/longsleeve_male_height.json";
import shirtHeightJson from "@/../public/models/shirt_male_height.json";
import tshirtHeightJson from "@/../public/models/tshirt_male_height.json";
import {
  BUILDS,
  type Fit,
  fitAt,
  fitStatus,
  heightBlend,
  heightKeyValues,
  type HeightTable,
  HeightTableSchema,
  MEASUREMENT_KEYS,
  type Measurements,
  sizeKeyValues,
  solveLinear,
  STRETCH_RATIO,
} from "@/lib/garment";

// Blenderが書き出した表。書き出し直して形が変わったら、ここで止まる
const tables: Record<string, HeightTable> = {
  tshirt: HeightTableSchema.parse(tshirtHeightJson),
  longsleeve: HeightTableSchema.parse(longsleeveHeightJson),
  shirt: HeightTableSchema.parse(shirtHeightJson),
};

function assertClose(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${String(actual)}と${String(expected)}の差が${String(tolerance)}を超える`,
  );
}

void test("身長キーは、標準より高ければheight_up、低ければheight_downに入る", () => {
  const table = { standard_cm: 170 };
  assert.deepEqual(heightKeyValues(175, table), {
    height_up: 5,
    height_down: 0,
  });
  assert.deepEqual(heightKeyValues(167, table), {
    height_up: 0,
    height_down: 3,
  });
  assert.deepEqual(heightKeyValues(170, table), {
    height_up: 0,
    height_down: 0,
  });
});

void test("身長の表は、前後の行を直線で補間し、範囲の外は端の行の値になる", () => {
  const samples = [
    { height_cm: 150, v: 0 },
    { height_cm: 160, v: 10 },
    { height_cm: 170, v: 30 },
  ];
  const at = (h: number) => {
    const { lo, hi, mix } = heightBlend(samples, h);
    return mix(lo.v, hi.v);
  };
  assert.equal(at(155), 5);
  assert.equal(at(160), 10);
  assert.equal(at(165), 20);
  assert.equal(at(140), 0);
  assert.equal(at(200), 30);
});

void test("表の行の身長では、その行の基準寸法と体の身幅になる", () => {
  for (const table of Object.values(tables)) {
    for (const build of BUILDS) {
      for (const sample of table.builds[build]) {
        const fit = fitAt(build, sample.height_cm, table);
        for (const p of MEASUREMENT_KEYS)
          assertClose(fit.base[p], sample.base[p]);
        assertClose(fit.bodyWidth, sample.body_width);
      }
    }
  }
});

void test("身幅で着られるかを決める：体以上はfits、伸ばせば届くならtight、それより小さければtooSmall", () => {
  const fit: Fit = {
    base: { length: 70, width: 50, shoulder: 45, sleeve: 20 },
    m: [],
    bodyWidth: 50,
  };
  const withWidth = (width: number): Measurements => ({ ...fit.base, width });
  assert.equal(fitStatus(withWidth(52), fit), "fits");
  assert.equal(fitStatus(withWidth(50), fit), "fits");
  assert.equal(fitStatus(withWidth(48), fit), "tight");
  assert.equal(fitStatus(withWidth(50 * (1 - STRETCH_RATIO)), fit), "tight");
  assert.equal(fitStatus(withWidth(44), fit), "tooSmall");
});

void test("連立方程式は、最初の係数が0でも行を入れ替えて解ける", () => {
  // 2y = 4、3x + y = 5 → x = 1、y = 2
  const [x, y] = solveLinear(
    [
      [0, 2],
      [3, 1],
    ],
    [4, 5],
  );
  assertClose(x, 1);
  assertClose(y, 2);
});

void test("基準寸法のままなら、サイズキーはすべて0になる", () => {
  for (const table of Object.values(tables)) {
    const fit = fitAt("standard", table.standard_cm, table);
    const keys = sizeKeyValues(fit.base, fit, table);
    for (const value of Object.values(keys)) assertClose(value, 0);
  }
});

void test("キーの値から作った寸法を解き直すと、同じキーの値に戻る（すべての服・体型・身長）", () => {
  // キーどうしの連動（身幅を広げると着丈も伸びる等）を打ち消せているかを確かめる
  const chosen = [2, -1.5, 0.5, 3];
  for (const [name, table] of Object.entries(tables)) {
    for (const build of BUILDS) {
      for (const heightCm of [150, 165, table.standard_cm, 190]) {
        const fit = fitAt(build, heightCm, table);
        const target = Object.fromEntries(
          MEASUREMENT_KEYS.map((p) => {
            const row = fit.m[table.parts.indexOf(p)];
            const change = row.reduce((sum, v, j) => sum + v * chosen[j], 0);
            return [p, fit.base[p] + change];
          }),
        ) as Measurements;
        const keys = sizeKeyValues(target, fit, table);
        table.parts.forEach((p, j) => {
          assert.ok(
            Math.abs(keys[`size_${p}`] - chosen[j]) <= 1e-6,
            `${name}・${build}・${String(heightCm)}cmのsize_${p}が${String(keys[`size_${p}`])}（${String(chosen[j])}のはず）`,
          );
        });
      }
    }
  }
});
