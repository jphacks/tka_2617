import assert from "node:assert/strict";
import { test } from "node:test";
import trousersHeightJson from "@/../public/models/trousers_male_height.json";
import { BUILDS } from "@/lib/garment";
import {
  TROUSER_KEYS,
  TROUSER_STRETCH_RATIO,
  type TrouserFit,
  trouserFitAt,
  trouserFitStatus,
  trouserKeyValues,
  type TrouserMeasurements,
  TrouserTableSchema,
} from "@/lib/trousers";

// Blenderが書き出した表。書き出し直して形が変わったら、ここで止まる
const table = TrouserTableSchema.parse(trousersHeightJson);

const fit: TrouserFit = {
  base: { waist: 40, hip: 50, thigh: 30, rise: 25, inseam: 75, hem: 18 },
  m: [],
  body: { waist: 40, hip: 50, thigh: 30 },
};

void test("一番きつい寸法で着られるかを決める", () => {
  const status = (change: Partial<TrouserMeasurements>) =>
    trouserFitStatus({ ...fit.base, ...change }, fit);
  assert.equal(status({}), "fits");
  // ウエストが大きいのはベルトで留められるので、着られる
  assert.equal(status({ waist: 60 }), "fits");
  assert.equal(status({ thigh: 29 }), "tight");
  assert.equal(status({ thigh: 30 * (1 - TROUSER_STRETCH_RATIO) }), "tight");
  assert.equal(status({ thigh: 28 }), "tooSmall");
  // 長さと裾幅は、着られるかに関わらない
  assert.equal(status({ inseam: 50, hem: 10 }), "fits");
});

void test("表の行の身長では、その行の基準寸法と体の寸法になる", () => {
  for (const build of BUILDS) {
    for (const sample of table.builds[build]) {
      const f = trouserFitAt(build, sample.height_cm, table);
      for (const p of TROUSER_KEYS) {
        assert.ok(Math.abs(f.base[p] - sample.base[p]) <= 1e-6);
      }
      assert.ok(Math.abs(f.body.hip - sample.body.hip) <= 1e-6);
    }
  }
});

void test("基準寸法のままなら、サイズキーはすべて0になる", () => {
  const f = trouserFitAt("standard", table.standard_cm, table);
  for (const value of Object.values(trouserKeyValues(f.base, f, table))) {
    assert.ok(Math.abs(value) <= 1e-9);
  }
});

/** キーの値から、その体型・身長での寸法を作る（M × キー + 基準寸法） */
function measurementsFromKeys(f: TrouserFit, keys: number[]) {
  return Object.fromEntries(
    TROUSER_KEYS.map((p) => {
      const row = f.m[table.parts.indexOf(p)];
      const change = row.reduce((sum, v, j) => sum + v * keys[j], 0);
      return [p, f.base[p] + change];
    }),
  ) as TrouserMeasurements;
}

const heights = [150, 165, table.standard_cm, 190];

// ヒップとわたり幅は強く連動するので、キーの値は抑えて（RIDGE）解いている。
// そのためキーの値そのものは元に戻らないが、作り直した寸法は目標に近ければよい
void test("解いたキーで作り直した寸法が、目標の寸法から0.1cm以内になる（すべての体型・身長）", () => {
  const chosen = [2, -1, 1.5, 0.5, -2, 1];
  for (const build of BUILDS) {
    for (const heightCm of heights) {
      const f = trouserFitAt(build, heightCm, table);
      const target = measurementsFromKeys(f, chosen);
      const keys = trouserKeyValues(target, f, table);
      const rebuilt = measurementsFromKeys(
        f,
        table.parts.map((p) => keys[`size_${p}`]),
      );
      for (const p of TROUSER_KEYS) {
        assert.ok(
          Math.abs(rebuilt[p] - target[p]) <= 0.1,
          `${build}・${String(heightCm)}cmの${p}が${String(rebuilt[p])}（${String(target[p])}のはず）`,
        );
      }
    }
  }
});

void test("写真の寸法が矛盾していても、キーの値は暴れない（形が崩れない）", () => {
  // ヒップを広げ、わたり幅を狭める。RIDGEで抑えないと、キーの値は280を超える
  for (const build of BUILDS) {
    for (const heightCm of heights) {
      const f = trouserFitAt(build, heightCm, table);
      const target = {
        ...f.base,
        hip: f.base.hip + 5,
        thigh: f.base.thigh - 5,
      };
      for (const [key, value] of Object.entries(
        trouserKeyValues(target, f, table),
      )) {
        assert.ok(
          Math.abs(value) <= 20,
          `${build}・${String(heightCm)}cmの${key}が${String(value)}`,
        );
      }
    }
  }
});
