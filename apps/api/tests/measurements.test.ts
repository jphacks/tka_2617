import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMeasurements } from "#src/lib/measurements";
import {
  measurementInputSchema,
  metadataSchema,
  measurementVersion,
} from "#src/lib/measurement-schema";
import type { MeasurementInput } from "#src/lib/measurement-schema";

const base: MeasurementInput = {
  imageId: "ef1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34",
  category: "trousers",
  widthPx: 2000,
  heightPx: 2000,
  pixelsPerCm: 10,
  points: [],
};
const point = (id: number, x: number, y: number) => ({ id, x, y, score: null });
void test("パンツの周囲だけ2倍し、股下は測定画像上の中点を使う", () => {
  const measurements = calculateMeasurements({
    ...base,
    points: [
      point(1, 100, 100),
      point(2, 300, 100),
      point(3, 500, 100),
      point(4, 50, 300),
      point(14, 550, 300),
      point(9, 300, 300),
      point(7, 200, 1100),
      point(11, 400, 1100),
      point(12, 600, 1100),
    ],
  });
  assert.equal(measurements.waistCm, 80);
  assert.equal(measurements.hipCm, 100);
  assert.equal(measurements.thighWidthCm, 25);
  assert.equal(measurements.riseCm, 20);
  assert.equal(measurements.inseamCm, 80);
  assert.equal(measurements.hemWidthCm, 20);
  assert.equal(measurements.shoulderWidthCm, null);
});
void test("Tシャツは1始まりの点番号で計算する", () => {
  const measurements = calculateMeasurements({
    ...base,
    category: "short_sleeve_top",
    points: [
      point(7, 100, 100),
      point(25, 550, 100),
      point(9, 100, 300),
      point(12, 100, 350),
      point(20, 600, 350),
      point(1, 350, 50),
      point(16, 350, 750),
    ],
  });
  assert.equal(measurements.shoulderWidthCm, 45);
  assert.equal(measurements.sleeveLengthCm, 20);
  assert.equal(measurements.bodyWidthCm, 50);
  assert.equal(measurements.bodyLengthCm, 70);
});
void test("縮尺なし・点不足は0ではなくnull", () => {
  assert.equal(
    calculateMeasurements({ ...base, points: [point(1, 0, 0)] }).waistCm,
    null,
  );
  assert.equal(
    calculateMeasurements({
      ...base,
      pixelsPerCm: null,
      points: [point(1, 0, 0), point(3, 400, 0)],
    }).waistCm,
    null,
  );
});
void test("カテゴリ違い・重複・範囲外の点は受け付けない", () => {
  for (const points of [
    [point(25, 1, 1)],
    [point(1, 1, 1), point(1, 2, 2)],
    [point(1, 2000, 0)],
  ])
    assert.equal(
      measurementInputSchema.safeParse({ ...base, points }).success,
      false,
    );
});
void test("手入力の確定値を推定値で上書きせず保存用スキーマで受け取る", () => {
  const parsed = metadataSchema.parse({
    ...base,
    name: "パンツ",
    paperCorners: [],
    modelVersion: null,
    measurementVersion,
    measurements: { waistCm: 79 },
  });
  assert.equal(parsed.measurements.waistCm, 79);
  assert.equal(parsed.measurements.hipCm, null);
});
